const momentUtils = require('./momentUtils')();
const gitClient = require('./gitClient');
const bitbucketClient = require('./bitbucketClient');
const textResultLogger = require('./cycleTimeTextLogger');
const csvResultLogger = require('./cycleTimeCSVLogger');
const minimist = require('minimist');

const gClient = gitClient();
const bClient = bitbucketClient();
const args = minimist(process.argv.slice(2));

const NONE = "none";
const AUTHOR = "author";
const COLLABORATOR = "collaborator";
const ONLY_INCLUDE_WORKING_HOURS_ARG = args.w || false;
const NUMBER_OF_WEEKS = args.p || "1";
const TEAM = args.t || undefined;
const FILE_PREFIX = args.f || undefined;
const CLIENT = args.c || 'github';
main();

async function main() {
    if (+NUMBER_OF_WEEKS <= 0) {
        console.log("Number of weeks must be > 0");
        return;
    }
    try {
        let pullRequests;
        if (CLIENT === 'gh') {
            pullRequests = await gClient.getMergedPullRequests(NUMBER_OF_WEEKS, TEAM);
        } else if (CLIENT === 'bb') {
            pullRequests = await bClient.getMergedPullRequests(NUMBER_OF_WEEKS);
        } else {
            throw new Error(`Invalid client. Use 'gh' or 'bb'. Got ${CLIENT}`);
        }

        const prMetrics = pullRequests.map(pr => getPRWithCalculatedMetrics(pr));

        textResultLogger.writeResults(prMetrics, TEAM, ONLY_INCLUDE_WORKING_HOURS_ARG, FILE_PREFIX);
        csvResultLogger.writeResults(prMetrics, TEAM, ONLY_INCLUDE_WORKING_HOURS_ARG, FILE_PREFIX);
    } catch (error) {
        console.log(error);
    }
}

function getPRWithCalculatedMetrics(pr) {
    console.log(`calculating metrics for pr: ${pr.number}`);
    const events = [];
    const prInfo = `PR-${pr.number} (${pr.html_url})`;
    const prCreatedAt = pr.created_at;
    const prMergedAt = pr.merged_at;

    events.push({
        time: prCreatedAt,
        message: `${prInfo}: created by ${pr.user.login}. ${pr.totalAdditions} additions, ${pr.totalDeletions} deletions`,
        type: AUTHOR
    });
    events.push({
        time: prMergedAt,
        message: `${prInfo}: ${pr.merged_at ? 'merged' : 'closed - not merged'}`,
        type: NONE
    });

    function getEventType(user) {
        return pr.user.id === user.id ? AUTHOR : COLLABORATOR;
    }

    (pr.fromDraftToReadyEvents || []).forEach(fromDraftToReadyEvent => {
        events.push({
            time: fromDraftToReadyEvent.marked_ready_at,
            message: `${prInfo}: ${fromDraftToReadyEvent.user.login} marked PR ready for review`,
            type: getEventType(fromDraftToReadyEvent.user)
        });
    });

    pr.comments.forEach(comment => {
        events.push({
            time: comment.created_at,
            message: `${prInfo}: ${comment.user.login} commented (${comment.html_url})`,
            type: getEventType(comment.user)
        });
    });

    pr.reviews.forEach(review => {
        events.push({
            time: review.submitted_at,
            message: `${prInfo}: ${review.user.login} ${review.state} (${review.html_url})`,
            type: getEventType(review.user)
        });
    });

    pr.commits.forEach(commit => {
        const commitEvent = {
            time: commit.commit.author.date,
            message: `${prInfo}: ${commit.author ? commit.author.login : commit.commit.author.name} committed (${commit.html_url})`,
            type: commit.author ? getEventType(commit.author) : AUTHOR, //Assume PR author is no commit author.
            isCommitEvent: true,
        };
        events.push(commitEvent);
    });

    events.sort(eventSort);
    const collaboratorEvents = events.filter(e => isCollaboratorEvent(e) && !e.isCommitEvent);
    const firstCollaboratorEvent = collaboratorEvents.length > 0 ? collaboratorEvents[0].time : null; //First collaborator event can be null when the PR is closed without being merged.
    const firstCommitEvent = events.filter(event => event.isCommitEvent)[0].time;

    const timeToOpen = diffInMinutes(prCreatedAt, firstCommitEvent); //Time to be open can be null when commits are created after the PR is opened & force pushed.
    const timeToFirstInteraction = diffInMinutes(firstCollaboratorEvent, prCreatedAt);
    const timeToMerge = diffInMinutes(prMergedAt, prCreatedAt);
    const cycleTime = timeToOpen == null ? timeToMerge : diffInMinutes(prMergedAt, firstCommitEvent);
    const conversationBreakDurations = calculateconversationBreakDurations(events);

    return {
        ...pr,
        timeToOpen,
        timeToFirstInteraction,
        timeToMerge,
        cycleTime,
        events,
        conversationBreakDurations,
        conversationBreaks: conversationBreakDurations.length,
        numberOfCommits: pr.commits.length,
        numberOfFiles: pr.files.length,
        numberOfReviews: pr.reviews.length,
    };
}

function calculateconversationBreakDurations(events) {
    const conversationBreakDurations = [];
    let prevEvent = null;
    events.forEach(event => {
        if (prevEvent != null) {
            const collaboratorRespondingToAuthor = isAuthorEvent(prevEvent) && isCollaboratorEvent(event);
            const authorRespondingToCollaborator = isCollaboratorEvent(prevEvent) && isAuthorEvent(event);
            if (collaboratorRespondingToAuthor || authorRespondingToCollaborator) {
                conversationBreakDurations.push(diffInMinutes(event.time, prevEvent.time))
            }
        }

        prevEvent = event;
    });
    return conversationBreakDurations;
}

function isAuthorEvent(event) {
    return event.type === AUTHOR;
}

function isCollaboratorEvent(event) {
    return event.type === COLLABORATOR;
}

function diffInMinutes(laterDateTime, earlierDateTime) {
    return momentUtils.diffInMinutes(laterDateTime, earlierDateTime, ONLY_INCLUDE_WORKING_HOURS_ARG);
}

function eventSort(a, b) {
    return momentUtils.momentSort(a.time, b.time);
}

