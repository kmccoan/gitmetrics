const fs = require('fs');
const cycleTimeFileUtils = require('./cycleTimeFileUtils');
const momentUtils = require('./momentUtils')();

function writeResults(prMetrics, team, onlyIncludeWorkingHours = false, filePrefix = '') {
    const prRows = getPRMetricRows(prMetrics);
    try {
        fs.writeFileSync(
            getPRResultFileName(team, onlyIncludeWorkingHours, filePrefix),
            prRows
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
            momentUtils.extractDateFromIso(pr.created_at),
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

function getPRResultFileName(team, onlyIncludeWorkingHours, filePrefix) {
    return cycleTimeFileUtils.getResultFileName(filePrefix, `csv`, team, onlyIncludeWorkingHours);
}
