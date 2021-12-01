const moment = require('moment-business-time');
const gitClient = require('./gitClient');
const textResultLogger = require('./textResultLogger');
const csvResultLogger = require('./csvResultLogger');
const minimist = require('minimist');

const gClient = gitClient();
const args = minimist(process.argv.slice(2));

moment.updateLocale('en', {
    workinghours: {
        0: null,
        1: ['04:00:00', '19:00:00'],
        2: ['04:00:00', '19:00:00'],
        3: ['04:00:00', '19:00:00'],
        4: ['04:00:00', '19:00:00'],
        5: ['04:00:00', '19:00:00'],
        6: null
    }
});
const NONE = "none";
const AUTHOR = "author";
const COLLABORATOR = "collaborator";
const ONLY_INCLUDE_WORKING_HOURS_ARG = args.w || false;
const NUMBER_OF_WEEKS = args.p || "1";
const TEAM = args.t || undefined;
const FILE_PREFIX = args.f || undefined;
main();

async function main() {
    if (+NUMBER_OF_WEEKS < 0) {
        return;
    }
    try {
        const mergeCommitsForMaster = await gClient.getMergeCommitsForMaster(NUMBER_OF_WEEKS, TEAM);
        const pullRequests = await gClient.getPullRequests(NUMBER_OF_WEEKS, TEAM);

        const prMetrics = pullRequests.map(pr => getPRWithCalculatedMetrics(pr));
        const mergeCommitsByDay = getNumberOfCommitsPerDay(mergeCommitsForMaster);

        textResultLogger.writeResults(prMetrics, mergeCommitsByDay, TEAM, ONLY_INCLUDE_WORKING_HOURS_ARG, FILE_PREFIX);
        csvResultLogger.writeResults(prMetrics, mergeCommitsByDay, TEAM, ONLY_INCLUDE_WORKING_HOURS_ARG, FILE_PREFIX);
    } catch (error) {
        console.log(error);
    }
}


function getNumberOfCommitsPerDay(commits) {
    return commits.reduce((commitsByDay, commit) => {
        const commitDate = extractDateFromIso(commit.committedOn);
        if (commitDate in commitsByDay) {
            commitsByDay[commitDate]++
          }
          else {
            commitsByDay[commitDate] = 1
          }
          return commitsByDay
    }, {});
}

function extractDateFromIso(isoDateString) {
    const date = new Date(isoDateString);
    const year = date.getFullYear();
    const month = date.getMonth()+1;
    const dt = date.getDate();
    return `${year}-${month}-${dt}`;
}

function getPRWithCalculatedMetrics(pr) {
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
        events.push({
            time: commit.commit.author.date,
            message: `${prInfo}: ${commit.author ? commit.author.login : commit.commit.author.name} committed (${commit.html_url})`,
            type: commit.author ? getEventType(commit.author) : AUTHOR, //Assume PR author is no commit author.
            isCommitEvent: true,
        })
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
    const unit = "minutes";
    if (laterDateTime == null || earlierDateTime == null) {
        return null;
    }
    const laterMoment = moment(laterDateTime);
    const earlierMoment = moment(earlierDateTime);
    if (laterMoment.isBefore(earlierMoment, unit)) {
        return null;
    }

    return ONLY_INCLUDE_WORKING_HOURS_ARG ? laterMoment.workingDiff(earlierMoment, unit, true) : laterMoment.diff(earlierMoment, unit, true);
}

function eventSort(a, b) {
    return momentSort(a.time, b.time);
}

function momentSort(a, b) {
    return moment(a).toDate().getTime() - moment(b).toDate().getTime();
}

