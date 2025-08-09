describe('Bitbucket Client', () => {
    test('should get merged PRs from 1 week ago', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        // Expect all the base properties on the first PR, and title too
        const firstPR = results[0];
        expect(firstPR).toHaveProperty('number');
        expect(firstPR).toHaveProperty('html_url');
        expect(firstPR).toHaveProperty('created_at');
        expect(firstPR).toHaveProperty('merged_at');
        expect(firstPR).toHaveProperty('user');
        expect(firstPR).toHaveProperty('base');
        expect(firstPR).toHaveProperty('title');
    }, 300000);

    test('should get merged PRs with pagination', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(20);
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(50);
    }, 300000);

    test('should contain basic pull request data', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);

        const firstResult = results[0];
        
        expect(firstResult.number).toBeDefined();
        expect(firstResult.html_url).toBeDefined();
        expect(firstResult.created_at).toBeDefined();
        expect(firstResult.merged_at).toBeDefined();
        expect(firstResult.user).toBeDefined();
        expect(firstResult.base).toBeDefined();
    });

    test('should contain commits', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);

        const firstResult = results[0];
        expect(firstResult.commits).toBeDefined();
        expect(firstResult.commits.length).toBeGreaterThan(0);
        expect(firstResult.commits[0].commit.author.name).toBeDefined();
        expect(firstResult.commits[0].author.login).toBeDefined();
        expect(firstResult.commits[0].html_url).toBeDefined();
    }, 300000);

    test('should contain comments', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);

        const resultWithComments = results.find(pr => pr.comments && pr.comments.length > 0);
        expect(resultWithComments.comments).toBeDefined();
        expect(resultWithComments.comments.length).toBeGreaterThan(0);
        expect(resultWithComments.comments[0].user.login).toBeDefined();
        expect(resultWithComments.comments[0].html_url).toBeDefined();
    });

    test('should contain files', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);

        const resultWithFiles = results.find(pr => 
            pr.files && 
            pr.files.length > 1 && 
            pr.files.some(file => file.additions > 0 && file.deletions > 0)
        );
        expect(resultWithFiles.files).toBeDefined();
        expect(resultWithFiles.files.length).toBeGreaterThan(0);
        const fileWithChanges = resultWithFiles.files.find(file => file.additions > 0 || file.deletions > 0);
        expect(fileWithChanges.additions).toBeGreaterThan(0);
        expect(fileWithChanges.deletions).toBeGreaterThan(0);
    }, 300000);

    test('should contain reviews', async () => {
        const bitbucketClient = require('../bitbucketClient')();
        const results = await bitbucketClient.getMergedPullRequests(1);

        const resultWithReviews = results.find(pr => pr.reviews && pr.reviews.length > 0);
        expect(resultWithReviews.reviews).toBeDefined();
        expect(resultWithReviews.reviews.length).toBeGreaterThan(0);
        expect(resultWithReviews.reviews[0].state).toBeDefined();
        expect(resultWithReviews.reviews[0].submitted_at).toBeDefined();
        expect(resultWithReviews.reviews[0].user).toBeDefined();
        expect(resultWithReviews.reviews[0].html_url).toBeDefined();
    }, 300000);
    
}); 