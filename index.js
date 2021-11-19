const moment = require('moment-business-time');
const gitClient = require('./gitClient');
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
const NUMBER_OF_PRS = args.p || "1";
const TEAM = args.t || undefined;
main();

async function main() {
    if (+NUMBER_OF_PRS > 100) {
        console.log("Only supports 100 PRs atm");
        return;
    }
    try {
        const pullRequests = await gClient.getPullRequests(NUMBER_OF_PRS, TEAM);
        if (pullRequests.length > 0) {
            printStatistics(pullRequests);
        } else {
            console.log("This repository has no closed PRs");
        }
    } catch (error) {
        console.log(error);
    }
}

function printStatistics(pullRequests) {
    console.log(`------------------- Git Metrics -------------------\n`);
    printDefinitions();

    const prMetrics = pullRequests.map(pr => getPRWithCalculatedMetrics(pr));

    printOverallStatistics(prMetrics);

    [...prMetrics]
        .sort((a, b) => b.cycleTime - a.cycleTime)
        .forEach(prStat => printPullRequestStatistics(prStat));
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


function printDefinitions() {
    console.log(`Definitions`);
    console.log(`--------------------`);
    console.log(`Time to open:                Time from first commit to when PR is created. When a PR is rebased & forced pushed, this might be ? minutes`);
    console.log(`Time to first interaction:   Time from pr opening to the first collaborator interaction (comment/review)`);
    console.log(`Time to merge:               Time from created to pr close`);
    console.log(`Cycle time:                  Time from first commit || pr created to close`);
    console.log(`Conversation break duration: Duration of break between author/collaborator interactions`);
    console.log(`Conversation breaks:         Number of conversation breaks that happen in a PR - breaks are defined by a switch in speaker`);
}

function printPullRequestStatistics(prMetrics) {
    console.log(`\nPR-${prMetrics.number}: ${prMetrics.title}`);
    console.log(`--------------------`);
    console.log(`Time to open:                  ${formatTimeStat(prMetrics.timeToOpen)}`);
    console.log(`Time to first interaction:     ${formatTimeStat(prMetrics.timeToFirstInteraction)}`);
    console.log(`Time to merge:                 ${formatTimeStat(prMetrics.timeToMerge)}`);
    console.log(`Cycle time:                    ${formatTimeStat(prMetrics.cycleTime)}`);
    console.log(`Number of commits:             ${prMetrics.numberOfCommits}`);
    console.log(`Number of files:               ${prMetrics.numberOfFiles}`);
    console.log(`Lines changed:                 ${prMetrics.totalAdditions + prMetrics.totalDeletions}`);
    console.log(`Number of reviews:             ${prMetrics.numberOfReviews}`);
    console.log(`Conversation break duration:   median: ${formatTimeStat(calculateMedian(prMetrics.conversationBreakDurations))}, average ${formatTimeStat(calculateAverage(prMetrics.conversationBreakDurations))}`);
    console.log(`Conversation break durations:  ${prMetrics.conversationBreakDurations.map(duration => formatTimeStat(duration))}`);
    console.log(`Conversation breaks:           ${prMetrics.conversationBreaks}`);

    console.log('\nTimeline:');
    prMetrics.events.forEach(event => console.log(`${(formatTimestamp(event.time))}: ${event.message}`));
}


function printOverallStatistics(prMetrics) {
    const allPRMetrics = prMetrics
        .reduce((all, curr) => {
            all.timeToOpen.push(curr.timeToOpen);
            all.timeToFirstInteraction.push(curr.timeToFirstInteraction);
            all.timeToMerge.push(curr.timeToMerge);
            all.cycleTime.push(curr.cycleTime);
            all.numberOfCommits.push(curr.numberOfCommits);
            all.numberOfFiles.push(curr.numberOfFiles);
            all.lineChanges.push(curr.totalAdditions);
            all.lineChanges.push(curr.totalDeletions);
            all.numberOfReviews.push(curr.numberOfReviews);
            all.conversationBreakDurations.push(curr.conversationBreakDurations);
            all.conversationBreaks.push(curr.conversationBreaks);
            return all;
        }, {
            timeToOpen: [],
            timeToFirstInteraction: [],
            timeToMerge: [],
            cycleTime: [],
            numberOfCommits: [],
            numberOfFiles: [],
            lineChanges: [],
            numberOfReviews: [],
            conversationBreakDurations: [],
            conversationBreaks: []
        });

    const sortedByCreatedAt = [...prMetrics].sort((a, b) => momentSort(a.created_at, b.created_at))
    const latestPR = formatTimestamp(sortedByCreatedAt[sortedByCreatedAt.length - 1].created_at);
    const earliestPR = formatTimestamp(sortedByCreatedAt[0].created_at);

    const unreviewed = prMetrics.filter(pr => pr.conversationBreakDurations.length === 0).length;

    console.log(`\nOverall metrics for ${prMetrics.length} PRs spanning ${earliestPR} to ${latestPR}:`);
    console.log('--------------------');
    console.log(`Time to open:                 ${formatTimeMetrics(allPRMetrics.timeToOpen)}`);
    console.log(`Time to first interaction:    ${formatTimeMetrics(allPRMetrics.timeToFirstInteraction)}`);
    console.log(`Time to merge:                ${formatTimeMetrics(allPRMetrics.timeToMerge)}`);
    console.log(`Cycle time:                   ${formatTimeMetrics(allPRMetrics.cycleTime)}`);
    console.log(`Number of commits:            ${formatNumberMetrics(allPRMetrics.numberOfCommits)}`);
    console.log(`Number of files:              ${formatNumberMetrics(allPRMetrics.numberOfFiles)}`);
    console.log(`Lines changed:                ${formatNumberMetrics(allPRMetrics.lineChanges)}`);
    console.log(`Number of reviews:            ${formatNumberMetrics(allPRMetrics.numberOfReviews)}`);
    console.log(`Conversation break duration:  ${formatTimeMetrics(allPRMetrics.conversationBreakDurations.flat())}`);
    console.log(`Conversation breaks:          ${formatNumberMetrics(allPRMetrics.conversationBreaks)}`);
    console.log(`Number of unreviewed PRs:     ${unreviewed}/${prMetrics.length}`);


    function formatTimeMetrics(metrics) {
        return `median: ${formatTimeStat(calculateMedian(metrics))}, average: ${formatTimeStat(calculateAverage(metrics))}`;
    }

    function formatNumberMetrics(metrics) {
        return `median: ${calculateMedian(metrics).toFixed(2)}, average: ${calculateAverage(metrics).toFixed(2)}`
    }
}

function calculateMedian(numbers) {
    const sortedNums = [...numbers].filter(n => !!n).sort((a, b) => a - b);
    const mid = Math.floor(sortedNums.length / 2)
    return numbers.length % 2 !== 0 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function calculateAverage(numbers) {
    const total = numbers.filter(n => !!n).reduce((sum, curr) => sum + curr, 0);
    return total / numbers.length;
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

function formatTimeStat(timeInMinutes) {
    if (timeInMinutes) {
        if (timeInMinutes > 1440) {
            return `${(timeInMinutes / 1440).toFixed(2)} days`
        }

        if (timeInMinutes > 60) {
            return `${(timeInMinutes / 60).toFixed(2)} hours`
        }
        return `${timeInMinutes.toFixed(2)} minutes`
    }
    return `? minutes`
}

function formatTimestamp(timestamp) {
    return moment(timestamp).format('ddd, MMM Do h:mma');
}

function eventSort(a, b) {
    return momentSort(a.time, b.time);
}

function momentSort(a, b) {
    return moment(a).toDate().getTime() - moment(b).toDate().getTime();
}

