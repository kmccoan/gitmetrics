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

function extractDateFromIso(isoDateString) {
    const date = new Date(isoDateString);
    const year = date.getFullYear();
    const month = date.getMonth()+1;
    const dt = date.getDate();
    return `${year}-${month}-${dt}`;
}

module.exports = {
    getResultFileName: getResultFileName,
    extractDateFromIso: extractDateFromIso
}