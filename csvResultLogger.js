const fs = require('fs');
const loggerUtils = require('./loggerUtils');

function writeResults(prMetrics, mergeCommitsPerDay, team, onlyIncludeWorkingHours = false, filePrefix = '') {
    const prRows = getPRMetricRows(prMetrics);
    try {
        fs.writeFileSync(
            getPRResultFileName(team, onlyIncludeWorkingHours, filePrefix),
            prRows
        )
    } catch (err) {
        console.error(err)
    }
    
    const mergeRows = getMergesPerDayRows(mergeCommitsPerDay);
    try {
        fs.writeFileSync(
            getMergesResultFileName(team, onlyIncludeWorkingHours, filePrefix),
            mergeRows
        )
    } catch (err) {
        console.error(err)
    }

}

module.exports.writeResults = writeResults;


function getPRMetricRows(prMetrics) {
    const header = "PR number, Created at, Time to open (minutes), Time to first interaction (minutes), Time to merge (minutes), Cycle time (minutes), Number of commits, Number of files, Total additions, Total deletions, Number of reviews";
    const prMetricRows = prMetrics
        .map(pr => [
            `PR-${pr.number}`,
            pr.created_at,
            pr.timeToOpen,
            pr.timeToFirstInteraction,
            pr.timeToMerge,
            pr.cycleTime,
            pr.numberOfCommits,
            pr.numberOfFiles,
            pr.totalAdditions,
            pr.totalDeletions,
            pr.numberOfReviews
        ].join(','));

    return [header].concat(prMetricRows).join(`\n`);
}


function getMergesPerDayRows(mergesByDay) {
    const header = "Date, Number of merges to master";
    const mergeCommitPerDayRows = Object.keys(mergesByDay)
        .map(day => [
            day,
            mergesByDay[day]
        ].join(','));

    return [header].concat(mergeCommitPerDayRows).join(`\n`);
}

function getPRResultFileName(team, onlyIncludeWorkingHours, filePrefix) {
    return loggerUtils.getResultFileName(`${filePrefix}_results_pr`, `csv`, team, onlyIncludeWorkingHours);
}

function getMergesResultFileName(team, onlyIncludeWorkingHours, filePrefix) {
    return loggerUtils.getResultFileName(`${filePrefix}_results_merges_per_day`, `csv`, team, onlyIncludeWorkingHours);
}
