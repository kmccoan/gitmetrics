const fs = require('fs');
const loggerUtils = require('./loggerUtils');

function writeResults(mergeCommitsPerDay, team, filePrefix = '') {
    const mergeRows = getMergesPerDayRows(mergeCommitsPerDay);
    try {
        fs.writeFileSync(
            getMergesResultFileName(team, filePrefix),
            mergeRows
        )
    } catch (err) {
        console.error(err)
    }

}

module.exports.writeResults = writeResults;


function getMergesPerDayRows(mergesByDay) {
    const header = "Date, Number of merges to master";
    const mergeCommitPerDayRows = Object.keys(mergesByDay)
        .map(day => [
            day,
            mergesByDay[day]
        ].join(','));

    return [header].concat(mergeCommitPerDayRows).join(`\n`);
}

function getMergesResultFileName(team, filePrefix) {
    return loggerUtils.getResultFileName(`${filePrefix}${filePrefix ? `_` :``}deployment_frequency`, `csv`, team);
}
