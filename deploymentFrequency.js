const gClient = require('./gitClient');
const csvResultLogger = require('./deploymentFrequencyCSVLogger');
const loggerUtils = require('./loggerUtils');
const minimist = require('minimist');
const sClient = require('./sentryClient');

const gitClient = gClient();
const sentryClient = sClient();
const args = minimist(process.argv.slice(2));

const NUMBER_OF_WEEKS = args.p || "1";
const FILE_PREFIX = args.f || undefined;
main();

async function main() {
    if (+NUMBER_OF_WEEKS <= 0) {
        console.log("Number of weeks must be > 0");
        return;
    }
    try {
        const mergeCommitsForMaster = await gitClient.getMergeCommitsForMaster(NUMBER_OF_WEEKS);
        const mergeCommitsByDay = getNumberOfCommitsPerDay(mergeCommitsForMaster);
        // const deployments = await sentryClient.getDeployments();
        // const deploymentsByDay = getNumberOfDeploymentsPerDay(deployments);

        csvResultLogger.writeResults(mergeCommitsByDay, {}, FILE_PREFIX);
    } catch (error) {
        console.log(error);
    }
}


function getNumberOfCommitsPerDay(commits) {
    return getPerDay(commits, (commit) => commit.committedOn);
}


function getNumberOfDeploymentsPerDay(deployments) {
    return getPerDay(deployments, (deploy) => deploy.deployedAt);
}

function getPerDay(thingsWithDates, getDate) {
    return thingsWithDates.reduce((thingPerDay, thing) => {
        const thingsDate = loggerUtils.extractDateFromIso(getDate(thing));
        if (thingsDate in thingPerDay) {
            thingPerDay[thingsDate]++
          }
          else {
            thingPerDay[thingsDate] = 1
          }
          return thingPerDay
    }, {});
}
