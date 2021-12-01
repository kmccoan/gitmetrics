function getResultFileName(prefix, fileExt, team, onlyIncludeWorkingHours) {
    const date_ob = new Date(Date.now());
    const date = date_ob.getDate();
    const month = date_ob.getMonth() + 1;
    const year = date_ob.getFullYear();

    const fileNameAndExt = `${date}-${month}-${year}_${onlyIncludeWorkingHours ? `work_hours` : `all_hours`}_metrics.${fileExt}`;
    if (team) {
        return `${prefix}_${team}_${fileNameAndExt}`;
    }
    return `${prefix}_${fileNameAndExt}`;
}

module.exports.getResultFileName = getResultFileName;