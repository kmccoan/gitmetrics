const axios = require('axios').default;
const storage = require('node-persist');
const config = require("./config");
const momentUtils = require('./momentUtils')();

module.exports = function () {
    const orgSlug = config.SENTRY_ORGANIZATION_SLUG;
    const productionEnvSlug = config.SENTRY_PRODUCTION_ENVIRONMENT_SLUG;
    const token = config.SENTRY_AUTH_TOKEN;

    async function getDeployments() {
        await storage.init({
            dir: 'sentryData.json',
        })
    
        if (orgSlug.length === 0 || token.length === 0 || productionEnvSlug.length === 0) {
            console.log("Sentry is not set up to pull releases.");
            return [];
        }
        try {
            const releases = await getReleases();
            const productionReleases = await buildProductionReleases(releases);

            await appendNewReleasesToStorage(productionReleases);
            return storage.getItem('releases');
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    return {
        getDeployments: getDeployments,
    }

    async function appendNewReleasesToStorage(releases) {
        const storedReleases = (await storage.getItem('releases')) || [];
        for (const release of releases) {
            if (!storedReleases.find(r => r.version === release.version)) {
                storedReleases.push(release);
            }
        }

        await storage.setItem('releases', storedReleases);
    }

    function earliestToLatestDeploys(a, b) {
        return momentUtils.momentSort(a.dateFinished, b.dateFinished);
    }

    async function getReleases() {
        const lastHundredReleases = (
            await axios.get(`https://sentry.io/api/0/organizations/${orgSlug}/releases/`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                })
        ).data;

        return lastHundredReleases.reduce((uniques, release) => uniques.find(r => r.version === release.version) ? uniques : [...uniques, release], []);
    }   

    async function buildProductionReleases(releases) {
        const productionReleases = [];
        for (const release of releases) {
            // Searching all deployments will show us the earliest one if deployed multiple times.
            // For Dooly -- all `backend` and `ne` releases are deployments so you cannot tell which env. the release was deployed on.
            const deployments = (await axios.get(`https://sentry.io/api/0/organizations/${orgSlug}/releases/${release.version}/deploys/`, {
                headers: { Authorization: `Bearer ${token}` }
            })).data;
            const prodDeployments = deployments.filter(deployment => deployment.environment === productionEnvSlug);
            prodDeployments.sort(earliestToLatestDeploys);
            if (prodDeployments.length > 0) {
                productionReleases.push({
                    version: release.version,
                    deployedAt: prodDeployments[prodDeployments.length - 1].dateFinished,
                    deployCommit: release.version.split("-")[1]
                });
            }
        }
        return productionReleases;
    }    
};