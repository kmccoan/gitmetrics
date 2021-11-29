const { Octokit } = require("octokit");
const cache = require('node-file-cache').create({
    file: "./gitCache.json",
    life: 604800 //Cache for 1 week.
});
const config = require("./config");

module.exports = function () {
    const octokit = new Octokit({ auth: config.GITHUB_TOKEN });
    const owner = config.GITHUB_ORGANIZATION;
    const repo = config.GITHUB_REPO;

    async function getMergeCommitsForMaster(numberOfWeeksToFetch, team) {
        const commits = await listMergeCommits(numberOfWeeksToFetch, team);
        
        return commits
            .map(commit => ({ ...commit.commit, committedOn: commit.commit.committer.date }));
    }

    async function getMergedPullRequests(numberOfWeeksToFetch, team) {
        const pulls = await getMergedPRs(numberOfWeeksToFetch, team);

        let enrichedPulls = [];
        for (const pull of pulls) {
            if (cache.get(prCacheKey(pull))) {
                enrichedPulls.push(cache.get(prCacheKey(pull)));
            } else {
                const pullNumber = pull.number;

                const commits = await listPRCommits(pullNumber);
                const fileInfo = await getPRFileInfo(pullNumber);

                const pullComments = await listPRComments(pullNumber);
                const issueComments = await listIssueComments(pullNumber);
                const reviewInfo = await getReviewInfo(pullNumber);


                const enrichedPull = {
                    ...pull,
                    commits,
                    comments: (pullComments || []).concat(issueComments || []).concat(reviewInfo.reviewsComments || []),
                    reviews: reviewInfo.reviews,
                    ...fileInfo
                };
                enrichedPulls.push(enrichedPull)
                cache.set(prCacheKey(pull), enrichedPull);
                console.debug(`Retrieved from api: PR-${pull.number}`);
            }
        }
        return enrichedPulls;
    }


    return {
        getMergeCommitsForMaster: getMergeCommitsForMaster,
        getPullRequests: getMergedPullRequests
    }


    async function listIssueComments(pull_number) {
        return (await octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: pull_number,
        })).data;
    }

    async function getReviewInfo(pull_number) {
        const reviews = await listPRReviews(pull_number);
        const reviewsComments = await listReviewsComments(reviews, pull_number);
        return {
            reviews,
            reviewsComments
        }
    }

    async function listReviewsComments(reviews, pull_number) {
        const reviewsComments = [];
        for (const review of reviews) {
            const {
                data: aReviewComments,
            } = await octokit.rest.pulls.listCommentsForReview({
                owner,
                repo,
                pull_number,
                review_id: review.id,
            });
            reviewsComments.push(aReviewComments);
        }
        return reviewsComments.flat();
    }

    async function listPRReviews(pull_number) {
        return (await octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number,
        })).data;
    }

    async function listPRComments(pull_number) {
        return (await octokit.rest.pulls.listReviewComments({
            owner,
            repo,
            pull_number,
        })).data;
    }

    async function listPRCommits(pull_number) {
        return (await octokit.rest.pulls.listCommits({
            owner,
            repo,
            pull_number
        })).data;
    }

    async function listMergeCommits(numberOfWeeksToFetch, team) {
        const allMergeCommits = [];
        const from = new Date();
        from.setDate(from.getDate() - (numberOfWeeksToFetch * 7));
        let index = 1;
        while (true) {
            const { data: commits } = (await octokit.rest.repos.listCommits({
                owner,
                repo,
                per_page: 100,
                page: index
            }))

            const mergeCommits = commits.filter(commit => commit.commit.message.includes("Merge pull request"));
            const mergedCommitsInTimeframe = mergeCommits.filter(commit => new Date(commit.commit.committer.date) - from >= 0);
            allMergeCommits.push(mergedCommitsInTimeframe);

            if (mergeCommits.length !== mergedCommitsInTimeframe.length) {
                break;
            }
            index++;
        }

        if (team) {
            const teamMembers = await listTeamMembers(team);
            return allMergeCommits.flat().filter(commit => teamMembers.includes(commit.author.login));
        }

        return allMergeCommits.flat();
    }

    async function getMergedPRs(numberOfWeeksToFetch, team) {
        const allMergedPRs = [];
        const from = new Date();
        from.setDate(from.getDate() - (numberOfWeeksToFetch * 7));
        let index = 1;
        while (true) {
            const { data: pulls } = await octokit.rest.pulls.list({
                owner,
                repo,
                state: "close",
                per_page: 100,
                page: index,
                sort: 'updated',
                direction: 'desc'
            });
            const mergedPRs = pulls.filter(pr => !!pr.merged_at);
            const mergedPRsWithinTimeframe = mergedPRs.filter(pull => new Date(pull.merged_at) - from >= 0);
            allMergedPRs.push(mergedPRsWithinTimeframe);

            if (mergedPRs.length !== mergedPRsWithinTimeframe.length) {
                break;
            }
            index++;
        }

        if (team) {
            const teamMembers = await listTeamMembers(team);
            return allMergedPRs.flat().filter(pr => teamMembers.includes(pr.user.login));
        }

        return allMergedPRs.flat();
    }

    async function listTeamMembers(team) {
        const cachedTeam = cache.get(team);
        if (cachedTeam) {
            return cachedTeam;
        }
        try {
            const members = await octokit.request('GET /orgs/{org}/teams/{team_slug}/members', {
                org: owner,
                team_slug: team
            });
            const teamMembers = members.data.map(member => member.login);
            cache.set(team, teamMembers);
            return teamMembers;
        } catch (e) {
            console.log("Could not fetch team: " + e);
            return [];
        }
    }

    async function getPRFileInfo(pull_number) {
        const files = (await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number,
        })).data;

        const totalAdditions = files.reduce((total, current) => {
            return total + current.additions;
        }, 0);
        const totalDeletions = files.reduce((total, current) => {
            return total + current.deletions;
        }, 0);

        return {
            totalAdditions,
            totalDeletions,
            files
        };
    }
};

function prCacheKey(pull) {
    return `${pull.number}`;
}
