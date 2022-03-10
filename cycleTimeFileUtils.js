const loggerUtils = require('./loggerUtils');

function getResultFileName(prefix, fileExt, team, onlyIncludeWorkingHours) {
    const todaysDate = loggerUtils.getTodayDateAsString();
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