const fs = require('fs');
const moment = require('moment-business-time');
const cycleTimeFileUtils = require('./cycleTimeFileUtils');


function writeResults(prMetrics, team, onlyIncludeWorkingHours = false, filePrefix = '') {
    const header = getHeader(team);
    const definitions = printDefinitions();

    const overallMetricResults = getOverallStatisticsResults(prMetrics);

    const prMetricResults = [...prMetrics]
        .sort((a, b) => b.cycleTime - a.cycleTime)
        .map(prStat => `${printPullRequestStatistics(prStat)}\n\n`);

    try {
        fs.writeFileSync(
            getResultFileName(team, onlyIncludeWorkingHours, filePrefix),
            [header, definitions, overallMetricResults, prMetricResults].join(`\n`)
        )
    } catch (err) {
        console.error(err)
    }

}

module.exports.writeResults = writeResults;


function printDefinitions() {
    return [`Definitions`,
        `--------------------`,
        `Time to open:                Time from first commit to when PR is created. When a PR is rebased & forced pushed, this might be ? minutes`,
        `Time to first interaction:   Time from pr opening to the first collaborator interaction (comment/review)`,
        `Time to merge:               Time from created to pr close`,
        `Cycle time:                  Time from first commit || pr created to close`,
        `Conversation break duration: Duration of break between author/collaborator interactions`,
        `Conversation breaks:         Number of conversation breaks that happen in a PR - breaks are defined by a switch in speaker`
    ].join(`\n`);
}

function printPullRequestStatistics(prMetrics) {
    const prMetricResults = [
        `\nPR-${prMetrics.number}: ${prMetrics.title}`,
        `--------------------`,
        `Time to open:                  ${formatTimeStat(prMetrics.timeToOpen)}`,
        `Time to first interaction:     ${formatTimeStat(prMetrics.timeToFirstInteraction)}`,
        `Time to merge:                 ${formatTimeStat(prMetrics.timeToMerge)}`,
        `Cycle time:                    ${formatTimeStat(prMetrics.cycleTime)}`,
        `Number of commits:             ${prMetrics.numberOfCommits}`,
        `Number of files:               ${prMetrics.numberOfFiles}`,
        `Lines changed:                 ${calculateLinesChanges(prMetrics)}`,
        `Number of reviews:             ${prMetrics.numberOfReviews}`,
        `Conversation break duration:   median: ${formatTimeStat(calculateMedian(prMetrics.conversationBreakDurations))}, average ${formatTimeStat(calculateAverage(prMetrics.conversationBreakDurations))}`,
        `Conversation break durations:  ${prMetrics.conversationBreakDurations.map(duration => formatTimeStat(duration))}`,
        `Conversation breaks:           ${prMetrics.conversationBreaks}`
    ].join(`\n`);

    const timelineEvents = prMetrics.events.map(event => `${(formatTimestamp(event.time))}: ${event.message}`);

    return [].concat(prMetricResults, ['\nTimeline:'], timelineEvents).join(`\n`);
}


function getOverallStatisticsResults(prMetrics) {
    const allPRMetrics = prMetrics
        .reduce((all, curr) => {
            all.timeToOpen.push(curr.timeToOpen);
            all.timeToFirstInteraction.push(curr.timeToFirstInteraction);
            all.timeToMerge.push(curr.timeToMerge);
            all.cycleTime.push(curr.cycleTime);
            all.numberOfCommits.push(curr.numberOfCommits);
            all.numberOfFiles.push(curr.numberOfFiles);
            all.lineChanges.push(calculateLinesChanges(curr));
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

    const sortedByMergedAt = [...prMetrics].sort((a, b) => momentSort(a.merged_at, b.merged_at))
    const latestMergedPR = formatTimestamp(sortedByMergedAt[sortedByMergedAt.length - 1].merged_at);
    const earliestMergedPR = formatTimestamp(sortedByMergedAt[0].merged_at);

    const unreviewed = prMetrics.filter(pr => pr.conversationBreakDurations.length === 0).length;

    return [
        `\nOverall metrics for ${prMetrics.length} PRs spanning PRs merged on ${earliestMergedPR} to ${latestMergedPR}:`,
        '--------------------',
        `Time to open:                 ${formatTimeMetrics(allPRMetrics.timeToOpen)}`,
        `Time to first interaction:    ${formatTimeMetrics(allPRMetrics.timeToFirstInteraction)}`,
        `Time to merge:                ${formatTimeMetrics(allPRMetrics.timeToMerge)}`,
        `Cycle time:                   ${formatTimeMetrics(allPRMetrics.cycleTime)}`,
        `Number of commits:            ${formatNumberMetrics(allPRMetrics.numberOfCommits)}`,
        `Number of files:              ${formatNumberMetrics(allPRMetrics.numberOfFiles)}`,
        `Lines changed:                ${formatNumberMetrics(allPRMetrics.lineChanges)}`,
        `Number of reviews:            ${formatNumberMetrics(allPRMetrics.numberOfReviews)}`,
        `Conversation break duration:  ${formatTimeMetrics(allPRMetrics.conversationBreakDurations.flat())}`,
        `Conversation breaks:          ${formatNumberMetrics(allPRMetrics.conversationBreaks)}`,
        `Number of unreviewed PRs:     ${unreviewed}/${prMetrics.length}`
    ].join(`\n`);

    function formatTimeMetrics(metrics) {
        return `median: ${formatTimeStat(calculateMedian(metrics))}, average: ${formatTimeStat(calculateAverage(metrics))}`;
    }

    function formatNumberMetrics(metrics) {
        return `median: ${calculateMedian(metrics).toFixed(2)}, average: ${calculateAverage(metrics).toFixed(2)}`
    }
}

function calculateLinesChanges(prMetrics) {
    return prMetrics.totalAdditions + prMetrics.totalDeletions;
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

function calculateMedian(numbers) {
    const sortedNums = [...numbers].filter(n => !!n).sort((a, b) => a - b);
    const mid = Math.floor(sortedNums.length / 2)
    return numbers.length % 2 !== 0 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function calculateAverage(numbers) {
    const total = numbers.filter(n => !!n).reduce((sum, curr) => sum + curr, 0);
    return total / numbers.length;
}

function momentSort(a, b) {
    return moment(a).toDate().getTime() - moment(b).toDate().getTime();
}

function getResultFileName(team, onlyIncludeWorkingHours, filePrefix) {
    return cycleTimeFileUtils.getResultFileName(filePrefix, `txt`, team, onlyIncludeWorkingHours);
}

function getHeader(team) {
    if (team) {
        return `------------- Git metrics for ${team} -------------\n`;
    }
    return `------------------- Git metrics -------------------\n`;
}

