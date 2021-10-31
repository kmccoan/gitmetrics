const { Octokit } = require("octokit");
const cache = require('node-file-cache').create({
    file: "./gitCache.json", 
    life: 604800 //Cache for 1 week.
});
const config = require("./config");

//TODO: cache PR details locally and only fetch ones missing details
module.exports = function () {
    const octokit = new Octokit({ auth: config.GITHUB_TOKEN });
    const owner = config.GITHUB_ORGANIZATION;
    const repo = config.GITHUB_REPO;

    async function getMergedPullRequests(numberOfPRs) {
        const pulls = await getMergedPRs(numberOfPRs);

        let enrichedPulls = [];
        for (const pull of pulls) {
            if (cache.get(cacheKey(pull))) {
                enrichedPulls.push(cache.get(cacheKey(pull)));
            } else {
                const pullNumber = pull.number;

                const commits = await listCommits(pullNumber);
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
                cache.set(cacheKey(pull), enrichedPull);
                console.debug(`Retrieved from api: PR-${pull.number}`);
            }
        }
        return enrichedPulls;
    }


    return {
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

    async function listCommits(pull_number) {
        return (await octokit.rest.pulls.listCommits({
            owner,
            repo,
            pull_number,
        })).data;
    }

    async function getMergedPRs(numberOfPRs) {
        return (await octokit.rest.pulls.list({
            owner,
            repo,
            state: "close",
            per_page: numberOfPRs
        })).data
        .filter(pr => !!pr.merged_at);
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

function cacheKey(pull) {
    return `${pull.number}`;
}
