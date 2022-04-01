const fs = require('fs');
const loggerUtils = require('./loggerUtils');
const momentUtils = require('./momentUtils')();

function writeResults(mergeCommitsPerDay, deploymentsByDay, team, filePrefix = '') {
    const rows = getRows(mergeCommitsPerDay, deploymentsByDay);
    try {
        fs.writeFileSync(
            getDeployFreqFileName(team, filePrefix),
            rows
        )
    } catch (err) {
        console.error(err)
    }

}

module.exports.writeResults = writeResults;


function getRows(mergesByDay, deploymentsByDay) {
    const header = "Date, Number of merges to master, Deployments";
    const rows = getDateData(Object.keys(mergesByDay), Object.keys(deploymentsByDay))
        .map(day => [
            day,
            mergesByDay[day] || `0`,
            deploymentsByDay[day] || `0`
        ].join(','));

    return [header].concat(rows).join(`\n`);
}

function getDateData(daysWithMerges, daysWithDeploys) {
    const dates = daysWithMerges
    .concat(daysWithDeploys)
    .reduce((uniqueDays, day) => uniqueDays.find(d => d === day) ? uniqueDays : [...uniqueDays, day], []);
    dates.sort((a, b) => momentUtils.momentSort(a, b));
    return momentUtils.getDatesInRange(dates[0], dates[dates.length - 1]);
}


function getDeployFreqFileName(prefix) {
    const todaysDate = momentUtils.getTodayDateAsString();
    const fileNameAndExt = `${todaysDate}_metrics.csv`;
    const subDir = loggerUtils.getResultDir();
    const filePrefix = `${prefix ? `${prefix}_deployment_freq` :`deployment_freq`}`;
    return `${subDir}${filePrefix}_${fileNameAndExt}`;
}