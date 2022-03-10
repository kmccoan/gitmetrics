function getResultDir() {
    return `${__dirname}/results/`;
}

function getTodayDateAsString() {
    const date_ob = new Date(Date.now());
    const date = date_ob.getDate();
    const month = date_ob.getMonth() + 1;
    const year = date_ob.getFullYear();
    return `${date}-${month}-${year}`;
}

function extractDateFromIso(isoDateString) {
    const date = new Date(isoDateString);
    const year = date.getFullYear();
    const month = date.getMonth()+1;
    const dt = date.getDate();
    return `${year}-${month}-${dt}`;
}

module.exports = {
    getResultDir: getResultDir,
    getTodayDateAsString: getTodayDateAsString,
    extractDateFromIso: extractDateFromIso
}