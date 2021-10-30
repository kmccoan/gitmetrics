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

    const prStats = {};
    pullRequests.forEach(pr => {
        const stats = extractPullRequestStats(pr, onlyIncludeWorkingHours);
        prStats[pr.number] = stats;
    });

    printOverallStatistics(prStats, pullRequests.length);
    pullRequests
    .sort((a, b) => prStats[b.number].cycleTime - prStats[a.number].cycleTime)
    .forEach(pr => {
        printPullRequestStatistics(pr, prStats[pr.number]);
    });
   
}

function extractPullRequestStats(pr, onlyIncludeWorkingHours) {
    const authorEvents = {};
    const collaboratorEvents = {};
    const commitEvents = {};
    const prInfo = `PR-${pr.number} (${pr.html_url})`;
    const prCreatedAt = pr.created_at;
    const prMergedOrClosedAt = pr.merged_at || pr.closed_at;

    authorEvents[prCreatedAt] = `${prInfo}: created by ${pr.user.login}. ${pr.totalAdditions} additions, ${pr.totalDeletions} deletions`;
    authorEvents[prMergedOrClosedAt] = `${prInfo}: ${pr.merged_at ? 'merged' : 'closed - not merged'}`;

    pr.comments.forEach(comment => {
        const isPRAuthorComment = pr.user.login === comment.user.login;
        if (isPRAuthorComment) {
            authorEvents[comment.created_at] = `${prInfo}: ${comment.user.login} commented (${comment.html_url})`;
        }
        else {
            collaboratorEvents[comment.created_at] = `${prInfo}: ${comment.user.login} commented (${comment.html_url})`;
        }
    });

    pr.reviews.forEach(review => {
        collaboratorEvents[review.submitted_at] = `${prInfo}: ${review.user.login} ${review.state} (${review.html_url})`;
    });

    pr.commits.forEach(c => {
        commitEvents[c.commit.author.date] = `${prInfo}: ${c.author ? c.author.login : 'no author'} committed (${c.html_url})`;
    });

    const firstCollaboratorEvent = Object.keys(collaboratorEvents).sort(momentSort)[0];
    const firstCommitEvent = Object.keys(commitEvents).sort(momentSort)[0];

    const timeToOpen = diffInMinutes(prCreatedAt, firstCommitEvent, onlyIncludeWorkingHours); //Time to be open can be null when commits are created after the PR is opened & force pushed.
    const timeToFirstReviews = diffInMinutes(firstCollaboratorEvent, prCreatedAt, onlyIncludeWorkingHours);
    const timeToMerge = diffInMinutes(prMergedOrClosedAt, prCreatedAt, onlyIncludeWorkingHours);
    const cycleTime = timeToOpen == null ? timeToMerge : diffInMinutes(prMergedOrClosedAt, firstCommitEvent, onlyIncludeWorkingHours);
    const events = {
        ...authorEvents,
        ...collaboratorEvents,
        ...commitEvents
    };
    const numberOfCommits = pr.commits.length;
    const numberOfFiles = pr.files.length
    return {
        timeToOpen,
        timeToFirstReviews,
        timeToMerge,
        cycleTime,
        events,
        numberOfCommits,
        numberOfFiles
    };
}

function printDefinitions() {
    console.log(`Definitions`);
    console.log(`--------------------`);
    console.log(`Time to open:         Time from first commit to when PR is created. When a PR is rebased & forced pushed, this might be ? minutes`);
    console.log(`Time to first review: Time from pr opening to the first comment`);
    console.log(`Time to merge:        Time from created to pr close`);
    console.log(`Cycle time:           Time from first commit || pr created to close`);
}

function printPullRequestStatistics(pr, stats) {
    const { timeToOpen, timeToFirstReviews, timeToMerge, cycleTime, events, numberOfCommits, numberOfFiles } = stats;
    console.log(`\nPR-${pr.number}: ${pr.title}`);
    console.log(`--------------------`);
    console.log(`Time to open:         ${formatTimeStat(timeToOpen)}`);
    console.log(`Time to first review: ${formatTimeStat(timeToFirstReviews)}`);
    console.log(`Time to merge:        ${formatTimeStat(timeToMerge)}`);
    console.log(`Cycle time:           ${formatTimeStat(cycleTime)}`);
    console.log(`Number of commits:    ${numberOfCommits}`);
    console.log(`Number of files:      ${numberOfFiles} files, ${pr.totalAdditions} additions, ${pr.totalDeletions} deletions`);

    console.log('\nTimeline:');
    const sortedEvents = Object.keys(events).sort(momentSort);
    sortedEvents
        .forEach(timestamp => {
            console.log(`${(formatTimestamp(timestamp))}: ${events[timestamp]}`);
        });
}


function printOverallStatistics(prStats, numberOfPrs) {
    const allPRStats = Object.values(prStats)
    .reduce((all, curr) => {
        if (curr.timeToOpen) {
            all.timeToOpen.push(curr.timeToOpen)
        }
        all.timeToFirstReviews.push(curr.timeToFirstReviews)
        all.timeToMerge.push(curr.timeToMerge)
        all.cycleTime.push(curr.cycleTime)
        all.numberOfCommits.push(curr.numberOfCommits)
        all.numberOfFiles.push(curr.numberOfFiles)
        return all;
    }, {
        timeToOpen: [],
        timeToFirstReviews: [],
        timeToMerge: [],
        cycleTime: [],
        numberOfCommits: [],
        numberOfFiles: []
    });

    console.log(`\nOverall stats for ${numberOfPrs} PRs:`);
    console.log('--------------------');
    console.log(`Time to open:            ${formatTimeStats(allPRStats.timeToOpen)}`);
    console.log(`Time to first review:    ${formatTimeStats(allPRStats.timeToFirstReviews)}`);
    console.log(`Time to merge:           ${formatTimeStats(allPRStats.timeToMerge)}`);
    console.log(`Cycle time:              ${formatTimeStats(allPRStats.cycleTime)}`);
    console.log(`Number of commits:       ${formatNumberStats(allPRStats.numberOfCommits)}`);
    console.log(`Number of files:         ${formatNumberStats(allPRStats.numberOfFiles)}`);

    function formatTimeStats(stats) {
        return `median: ${formatTimeStat(calculateMedian(stats))}, average: ${formatTimeStat(calculateAverage(stats))}`;
    }

    function formatNumberStats(stats) {
        return `median: ${calculateMedian(stats)}, average: ${calculateAverage(stats)}`
    }
}

function calculateMedian(numbers) {
    const sortedNums = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sortedNums.length / 2)
    return numbers.length % 2 !== 0 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function calculateAverage(numbers) {
    const total = numbers.reduce((sum, curr) => sum + curr, 0);
    return total / numbers.length;
}

function diffInMinutes(laterDateTime, earlierDateTime, onlyIncludeWorkingHours) {
    const unit = "minutes";
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


function momentSort(a, b) {
    return moment(a).toDate().getTime() - moment(b).toDate().getTime();
}

