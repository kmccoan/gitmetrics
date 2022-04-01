const loggerUtils = require('./loggerUtils');
const momentUtils = require('./momentUtils')();

function getResultFileName(prefix, fileExt, team, onlyIncludeWorkingHours) {
    const todaysDate = momentUtils.getTodayDateAsString();
    const fileNameAndExt = `${todaysDate}_${onlyIncludeWorkingHours ? `work_hours` : `all_hours`}_metrics.${fileExt}`;
    const subDir = loggerUtils.getResultDir();
    const filePrefix = `${prefix ? `${prefix}_cycle_time` :`cycle_time`}`;
    if (team) {
        return `${subDir}${filePrefix}_${team}_${fileNameAndExt}`;
    }
    return `${subDir}${filePrefix}_${fileNameAndExt}`;
}

module.exports = {
    getResultFileName: getResultFileName
}