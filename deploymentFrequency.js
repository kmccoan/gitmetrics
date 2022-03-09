const gitClient = require('./gitClient');
const csvResultLogger = require('./deploymentFrequencyCSVLogger');
const loggerUtils = require('./loggerUtils');
const minimist = require('minimist');

const gClient = gitClient();
const args = minimist(process.argv.slice(2));

const NUMBER_OF_WEEKS = args.p || "1";
const TEAM = args.t || undefined;
const FILE_PREFIX = args.f || undefined;
main();

async function main() {
    if (+NUMBER_OF_WEEKS <= 0) {
        console.log("Number of weeks must be > 0");
        return;
    }
    try {
        const mergeCommitsForMaster = await gClient.getMergeCommitsForMaster(NUMBER_OF_WEEKS, TEAM);
        const mergeCommitsByDay = getNumberOfCommitsPerDay(mergeCommitsForMaster);

        csvResultLogger.writeResults(mergeCommitsByDay, TEAM, FILE_PREFIX);
    } catch (error) {
        console.log(error);
    }
}


function getNumberOfCommitsPerDay(commits) {
    return commits.reduce((commitsByDay, commit) => {
        const commitDate = loggerUtils.extractDateFromIso(commit.committedOn);
        if (commitDate in commitsByDay) {
            commitsByDay[commitDate]++
          }
          else {
            commitsByDay[commitDate] = 1
          }
          return commitsByDay
    }, {});
}
