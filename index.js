const moment = require('moment-business-time');
const gitClient = require('./gitClient');
const minimist = require('minimist');

const gClient = gitClient();
const args = minimist(process.argv.slice(1));

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

main(args.w, args.p);

const NONE = "none";
const AUTHOR = "author";
const COLLABORATOR = "collaborator";

async function main(onlyIncludeWorkingHours = false, numberOfPRs = "1") {
    if (+numberOfPRs > 100) {
        console.log("Only supports 100 PRs atm");
        return;
    }
    try {
        const pullRequests = await gClient.getPullRequests(numberOfPRs);
        printStatistics(pullRequests, onlyIncludeWorkingHours);
    } catch (error) {
        console.log(error);
    }
}

function printStatistics(pullRequests, onlyIncludeWorkingHours) {
    console.log(`------------------- Git Stats -------------------\n`);
    printDefinitions();

    const prStats = pullRequests.map(pr => getPRWithCalculatedStats(pr, onlyIncludeWorkingHours));

    printOverallStatistics(prStats);
    prStats
        .sort((a, b) => b.cycleTime - a.cycleTime)
        .forEach(prStat => printPullRequestStatistics(prStat));
}

function getPRWithCalculatedStats(pr, onlyIncludeWorkingHours) {
    const events = [];
    const prInfo = `PR-${pr.number} (${pr.html_url})`;
    const prCreatedAt = pr.created_at;
    const prMergedOrClosedAt = pr.merged_at || pr.closed_at;

    events.push({
        time: prCreatedAt,
        message: `${prInfo}: created by ${pr.user.login}. ${pr.totalAdditions} additions, ${pr.totalDeletions} deletions`,
        type: AUTHOR
    });
    events.push({
        time: prMergedOrClosedAt,
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
    
    const timeToOpen = diffInMinutes(prCreatedAt, firstCommitEvent, onlyIncludeWorkingHours); //Time to be open can be null when commits are created after the PR is opened & force pushed.
    const timeToFirstReview = diffInMinutes(firstCollaboratorEvent, prCreatedAt, onlyIncludeWorkingHours);
    const timeToMerge = diffInMinutes(prMergedOrClosedAt, prCreatedAt, onlyIncludeWorkingHours);
    const cycleTime = timeToOpen == null ? timeToMerge : diffInMinutes(prMergedOrClosedAt, firstCommitEvent, onlyIncludeWorkingHours);
    const conversationDurations = calculateConversationDurations(events);

    return {
        ...pr,
        timeToOpen,
        timeToFirstReview,
        timeToMerge,
        cycleTime,
        events,
        conversationDurations,
        numberOfCommits: pr.commits.length,
        numberOfFiles: pr.files.length,
        numberOfReviews: pr.reviews.length,
    };
}

function calculateConversationDurations(events) {
    const conversationDurations = [];
    let prevEvent = null;
    events.forEach(event => {
        if (prevEvent != null) {
            const collaboratorRespondingToAuthor = isAuthorEvent(prevEvent) && isCollaboratorEvent(event);
            const authorRespondingToCollaborator = isCollaboratorEvent(prevEvent) && isAuthorEvent(event);
            if (collaboratorRespondingToAuthor || authorRespondingToCollaborator) {
                conversationDurations.push(diffInMinutes(event.time, prevEvent.time))
            }
        }

        prevEvent = event;
    });
    return conversationDurations;
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
    console.log(`Time to open:         Time from first commit to when PR is created. When a PR is rebased & forced pushed, this might be ? minutes`);
    console.log(`Time to first review: Time from pr opening to the first collaborator interaction (comment/review)`);
    console.log(`Time to merge:        Time from created to pr close`);
    console.log(`Cycle time:           Time from first commit || pr created to close`);
    console.log(`Conversation cadence: Duration between author/collaborator interactions`);
}

function printPullRequestStatistics(prStats) {
    console.log(`\nPR-${prStats.number}: ${prStats.title}`);
    console.log(`--------------------`);
    console.log(`Time to open:         ${formatTimeStat(prStats.timeToOpen)}`);
    console.log(`Time to first review: ${formatTimeStat(prStats.timeToFirstReview)}`);
    console.log(`Time to merge:        ${formatTimeStat(prStats.timeToMerge)}`);
    console.log(`Cycle time:           ${formatTimeStat(prStats.cycleTime)}`);
    console.log(`Number of commits:    ${prStats.numberOfCommits}`);
    console.log(`Number of files:      ${prStats.numberOfFiles} files, ${prStats.totalAdditions} additions, ${prStats.totalDeletions} deletions`);
    console.log(`Number of reviews:    ${prStats.numberOfReviews}`);
    console.log(`Conversation cadence:  median: ${formatTimeStat(calculateMedian(prStats.conversationDurations))}, average ${formatTimeStat(calculateAverage(prStats.conversationDurations))}`);
    console.log(`Conversation cadences: ${prStats.conversationDurations.map(duration => formatTimeStat(duration))}`);

    console.log('\nTimeline:');
    prStats.events.forEach(event => console.log(`${(formatTimestamp(event.time))}: ${event.message}`));
}


function printOverallStatistics(prStats) {
    const allPRStats = Object.values(prStats)
        .reduce((all, curr) => {
            all.timeToOpen.push(curr.timeToOpen)
            all.timeToFirstReview.push(curr.timeToFirstReview)
            all.timeToMerge.push(curr.timeToMerge)
            all.cycleTime.push(curr.cycleTime)
            all.numberOfCommits.push(curr.numberOfCommits)
            all.numberOfFiles.push(curr.numberOfFiles)
            all.numberOfReviews.push(curr.numberOfReviews)
            all.conversationDurations.push(curr.conversationDurations)
            return all;
        }, {
            timeToOpen: [],
            timeToFirstReview: [],
            timeToMerge: [],
            cycleTime: [],
            numberOfCommits: [],
            numberOfFiles: [],
            numberOfReviews: [],
            conversationDurations: []
        });

    console.log(`\nOverall stats for ${Object.keys(prStats).length} PRs:`);
    console.log('--------------------');
    console.log(`Time to open:            ${formatTimeStats(allPRStats.timeToOpen)}`);
    console.log(`Time to first review:    ${formatTimeStats(allPRStats.timeToFirstReview)}`);
    console.log(`Time to merge:           ${formatTimeStats(allPRStats.timeToMerge)}`);
    console.log(`Cycle time:              ${formatTimeStats(allPRStats.cycleTime)}`);
    console.log(`Number of commits:       ${formatNumberStats(allPRStats.numberOfCommits)}`);
    console.log(`Number of files:         ${formatNumberStats(allPRStats.numberOfFiles)}`);
    console.log(`Number of reviews:       ${formatNumberStats(allPRStats.numberOfFiles)}`);
    console.log(`Conversaton cadence:     ${formatTimeStats(allPRStats.conversationDurations.flat())}`);


    function formatTimeStats(stats) {
        return `median: ${formatTimeStat(calculateMedian(stats))}, average: ${formatTimeStat(calculateAverage(stats))}`;
    }

    function formatNumberStats(stats) {
        return `median: ${calculateMedian(stats)}, average: ${calculateAverage(stats)}`
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

function diffInMinutes(laterDateTime, earlierDateTime, onlyIncludeWorkingHours) {
    const unit = "minutes";
    if (laterDateTime == null || earlierDateTime == null) {
        return null;
    }
    const laterMoment = moment(laterDateTime);
    const earlierMoment = moment(earlierDateTime);
    if (laterMoment.isBefore(earlierMoment, unit)) {
        return null;
    }

    return onlyIncludeWorkingHours ? laterMoment.workingDiff(earlierMoment, unit, true) : laterMoment.diff(earlierMoment, unit, true);
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
    return moment(a.time).toDate().getTime() - moment(b.time).toDate().getTime();
}

