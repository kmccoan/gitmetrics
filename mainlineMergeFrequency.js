const gClient = require('./gitClient');
const csvResultLogger = require('./mainlineMergeFrequencyCSVLogger');
const minimist = require('minimist');
const momentUtils = require('./momentUtils')();

const gitClient = gClient();
const args = minimist(process.argv.slice(2));

const NUMBER_OF_WEEKS = args.p || "1";
const FILE_PREFIX = args.f || undefined;
const TEAM = args.t || undefined;
const MAIN_BRANCH_NAME = args.b || "main";
main();

async function main() {
    if (+NUMBER_OF_WEEKS <= 0) {
        console.log("Number of weeks must be > 0");
        return;
    }
    try {
        const mergedPRs = await gitClient.getMergedPullRequests(NUMBER_OF_WEEKS, TEAM);

        const mergedMainlinePRs = mergedPRs.filter(pr => pr.base.ref === MAIN_BRANCH_NAME)
        const mergedPRsByDay = getNumberOfMergedPRsPerDay(mergedMainlinePRs);

        csvResultLogger.writeResults(mergedPRsByDay, TEAM, FILE_PREFIX);
    } catch (error) {
        console.log(error);
    }
}


function getNumberOfMergedPRsPerDay(prs) {
    return getPerDay(prs, pr => pr.merged_at);
}

function getPerDay(thingsWithDates, getDate) {
    return thingsWithDates.reduce((thingPerDay, thing) => {
        const thingsDate = momentUtils.extractDateFromIso(getDate(thing));
        if (thingsDate in thingPerDay) {
            thingPerDay[thingsDate]++
        }
        else {
            thingPerDay[thingsDate] = 1
        }
        return thingPerDay
    }, {});
}
