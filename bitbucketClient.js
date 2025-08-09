const axios = require('axios');
const cache = require('node-file-cache').create({
    file: "./bitbucketCache.json",
    life: 1728000 //Cache for 20 days.
});
const config = require("./config");

module.exports = function () {
    // Bitbucket API configuration
    const baseURL = 'https://api.bitbucket.org/2.0';
    const workspace = config.BITBUCKET_WORKSPACE;
    const repo = config.BITBUCKET_REPO;
    
    // Create axios instance with authentication
    const bitbucketAPI = axios.create({
        auth: {
            username: config.BITBUCKET_USERNAME,
            password: config.BITBUCKET_APP_PASSWORD
        },
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });

    /**
     * @param {string} numberOfWeeksToFetch - Number of weeks of data to fetch
     * @returns {Array} Array of enriched pull request objects
     */
    async function getMergedPullRequests(numberOfWeeksToFetch) {
        console.log(`Fetching Bitbucket PRs for ${numberOfWeeksToFetch} weeks`);
        
        try {
            // Step 1: Get basic merged PRs
            const pulls = await getMergedPRs(numberOfWeeksToFetch);
            console.log(`Found ${pulls.length} merged PRs`);

            // Step 2: Enrich each PR with additional data
            const enrichedPulls = [];
            for (const pull of pulls) {
                const cacheKey = prCacheKey(pull);
                
                if (cache.get(cacheKey)) {
                    enrichedPulls.push(cache.get(cacheKey));
                    console.debug(`Retrieved from cache: PR-${pull.id}`);
                } else {
                    console.debug(`Enriching from API: PR-${pull.id}`);
                    
                    // Get additional data for this PR
                    const comments = await listPRComments(pull.id, pull.links.comments.href);
                    const changedFilesWithDiffStats = await getChangedFilesWithDiffStats(pull.id, pull.links.diffstat.href);
                    const activity = await getPRActivity(pull.id, pull.links.activity.href);
                    const commits = await listPRCommits(pull, pull.id, pull.links.commits.href, activity);
                    
                    const enrichedPull = {
                        ...pull,
                        commits,
                        comments,
                        activity,
                        ...changedFilesWithDiffStats
                    };
                    
                    enrichedPulls.push(enrichedPull);
                    cache.set(cacheKey, enrichedPull);
                    console.debug(`Retrieved from API: PR-${enrichedPull.id}`);
                }
            }

            const transformedPulls = enrichedPulls
                .filter(pull => pull.commits.length > 0)
                .map(pr => transformPRToGitHubFormat(pr));
            console.log(`Transformed ${transformedPulls.length} PRs to GitHub format`);
            
            return transformedPulls;
            
        } catch (error) {
            console.error('Error fetching Bitbucket pull requests:', error.message);
            throw error;
        }
    }

    /**
     * Get merged PRs within the specified timeframe
     */
    async function getMergedPRs(numberOfWeeksToFetch) {
        const allMergedPRs = [];
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - (numberOfWeeksToFetch * 7));
    
        let next = `${baseURL}/repositories/${workspace}/${repo}/pullrequests?state=MERGED&sort=-updated_on&pagelen=50`;
        
        while (next) {
            try {
                const response = await bitbucketAPI.get(next);
                
                const responseData = response.data;
                const prs = responseData.values || [];

                if (prs.length === 0) break;
                
                // Filter PRs within timeframe
                const prsInTimeframe = prs.filter(pr => {
                    const mergedDate = new Date(pr.updated_on); // Using updated_on as proxy for merge date
                    return mergedDate >= fromDate;
                });
                
                allMergedPRs.push(...prsInTimeframe);
                
                // If we got fewer PRs in timeframe than total PRs, we've passed our date range
                if (prsInTimeframe.length < prs.length) {
                    break;
                }
                
                // Check if there are more pages
                next = responseData.next || null;
                
            } catch (error) {
                console.error(`Error fetching PRs at URL ${next}:`, error.message);
                break;
            }
        }
        
        return allMergedPRs;
    }

    /**
     * Get commits for a specific PR
     */
    async function listPRCommits(bitbucketPR, pullRequestId, commitsUrl, activity) {
        const commits = [];
        try {
            const response = await bitbucketAPI.get(commitsUrl);
            commits.push(...response.data.values); //This response may only have the merge commit if they squash merged.s
            if (
                bitbucketPR.source &&
                bitbucketPR.source.commit &&
                bitbucketPR.source.commit.links &&
                bitbucketPR.source.commit.links.self &&
                bitbucketPR.source.commit.links.self.href
            ) {
                const sourceCommitUrl = bitbucketPR.source.commit.links.self.href;
                const commit = (await bitbucketAPI.get(sourceCommitUrl)).data;
                commits.push(commit);
            }

            for (let i = 0; i < activity.length; i++) {
                const event = activity[i];
                if (event.update && event.update.state === 'OPEN' && !Object.keys(event.update.changes).length) {
                    const commit = (await bitbucketAPI.get(event.update.source.commit.links.self.href)).data;
                    commits.push(commit);
                }
            };

            // Deduplicate commits by hash, keeping the first occurrence, and return only unique commits
            const seen = new Set();
            const uniqueCommits = commits.filter(c => {
                if (seen.has(c.hash)) return false;
                seen.add(c.hash);
                return true;
            });
            return uniqueCommits;
        } catch (error) {
            console.error(`Error fetching commits for PR ${commitsUrl}:`, error.message);
            return [];
        }
    }

    /**
     * Get file changes and diff stats for a PR
     */
    async function getChangedFilesWithDiffStats(pullRequestId, diffstatUrl) {
        try {
            console.log(`Fetching file changes and diff stats for PR ${pullRequestId}`);
            const response = await bitbucketAPI.get(diffstatUrl);
            const filesChanges = response.data.values || [];
            
            const totalAdditions = filesChanges.reduce((total, file) => total + (file.lines_added || 0), 0);
            const totalDeletions = filesChanges.reduce((total, file) => total + (file.lines_removed || 0), 0);
            console.log(`Fetched file changes and diff stats for PR ${pullRequestId}`);
            return {
                totalAdditions,
                totalDeletions,
                files: filesChanges
            };
        } catch (error) {
            console.error(`Error fetching file info for URL ${diffstatUrl}...`, error.message);    
            throw error;
        }
    }

    /**
     * Get all comments for a PR
     */
    async function listPRComments(pullRequestId, commentsUrl) {
        try {
            console.log(`Fetching comments for PR ${pullRequestId}`);
            const response = await bitbucketAPI.get(commentsUrl);
            console.log(`Fetched comments for PR ${pullRequestId}`);
            return response.data.values || [];
        } catch (error) {
            console.error(`Error fetching comments for PR ${commentsUrl}:`, error.message);
            throw error;
        }
    }

    /**
     * Get activity log for a PR (includes approvals, comments, updates)
     */
    async function getPRActivity(pullRequestId, activityUrl) {
        try {
            console.log(`Fetching activity for PR ${pullRequestId}`);
            const response = await bitbucketAPI.get(activityUrl);
            console.log(`Fetched activity for PR ${pullRequestId}`);
            return response.data.values || [];
        } catch (error) {
            console.error(`Error fetching activity for PR ${pullRequestId}:`, error.message);
             throw error;
        }
    }

    /**
     * Transform Bitbucket PR to GitHub-compatible format
     */
    function transformPRToGitHubFormat(pr) {
        return {
            // Basic PR fields mapped to GitHub format
            number: pr.id,
            title: pr.title,
            html_url: pr.links?.html?.href || '',
            created_at: pr.created_on,
            merged_at: getMergedDate(pr.activity),
            user: {
                login: getUserName(pr.author)
            },
            base: {
                ref: pr.destination?.branch?.name || 'main'
            },
            
            // Enriched data
            commits: transformCommitsIntoMinimalGithubFormat(pr),
            comments: transformCommentsIntoMinimalGithubFormat(pr),
            reviews: extractReviewsFromActivity(pr),
            fromDraftToReadyEvents: extractFromDraftToReadyEvents(pr),
            totalAdditions: pr.totalAdditions || 0,
            totalDeletions: pr.totalDeletions || 0,
            files: transformToMinimalGithubFormat(pr)
        };
    }

    /**
     * Extract GitHub-style reviews from Bitbucket activity and participants
     */
    function extractReviewsFromActivity(pr) {
        const reviews = [];
        
        pr.activity.forEach(event => {
            if (event.approval) {
                reviews.push({
                    submitted_at: event.approval.date,
                    user:{
                        login: getUserName(event.approval.user),
                        id: getUserId(event.approval.user)
                    },
                    state: `APPROVED`,
                    html_url: event.approval.pullrequest.links.html.href
                });
            }
            // TODO: Add changes requested.
        });
    
        
        return reviews;
    }

    function extractFromDraftToReadyEvents(pr) {
        const fromDraftToReadyEvents = [];
        
        pr.activity.forEach(event => {
            if (event.update && event.update.changes.draft?.old === true && event.update.changes.draft?.new === false) {
                fromDraftToReadyEvents.push({
                    marked_ready_at: event.update.date,
                    user:{
                        login: getUserName(event.update.author),
                        id: getUserId(event.update.author)
                    }
                });
            }
        });
    
        
        return fromDraftToReadyEvents;
    }

    function getMergedDate(activity = []) {
        for (const event of activity) {
            if (event.update && event.update.state === 'MERGED' && event.update.changes.status?.new === 'fulfilled') {
                return new Date(event.update.date);
            }
        }
        return null;
    }

    /**
     * Generate cache key for a PR
     */
    function prCacheKey(pull) {
        return `bitbucket_${pull.id}`;
    }

    // Return the public interface (matches gitClient.js)
    return {
        getMergedPullRequests: getMergedPullRequests
    };
}; 

function transformToMinimalGithubFormat(pr) {
    console.log(`Transforming ${pr.files.length} files to minimal GitHub format for PR ${pr.id}`);
    return pr.files.map(file => ({
        additions: file.lines_added || 0,
        deletions: file.lines_removed || 0
    }));
}

//TODO: Typescript format instead of formatting to Github.
function transformCommentsIntoMinimalGithubFormat(pr) {
    const comments = pr.comments || [];
    return comments.map(comment => ({
        created_at: comment.created_on,
        user: {
            login: getUserName(comment.user),
            id: getUserId(comment.user)
        },
        html_url: comment.links?.html?.href || ''
    }));
}

//TODO: Typescript format instead of formatting to Github.
function transformCommitsIntoMinimalGithubFormat(bitbucketPR) {
    const commits = bitbucketPR.commits.filter(commit => !commit.hash.includes(bitbucketPR.merge_commit.hash)) || [];
    console.log(`Transforming ${commits.length} commits to minimal GitHub format for PR ${bitbucketPR.id}`);
    return commits.map(commit => {
        return {
            commit: {
                author: {
                    date: commit.date,
                    name: getUserName(commit.author?.user)
                }
            },
            author: {
                login: getUserName(commit.author?.user)
            },
            html_url: commit.links?.html?.href || `${bitbucketPR.links?.html?.href}/commits/${commit.hash}`
        }
    });
}

function getUserName(user) {
    return user?.display_name || user?.nickname || '';
}

function getUserId(user) {
    return user?.uuid || user?.account_id || '';
}
