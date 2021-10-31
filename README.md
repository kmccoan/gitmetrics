# Setup
If needed, create a personal access token at https://github.com/settings/tokens/new?scopes=repo

Create a config.js file with the following format:
```
module.exports = {
   GITHUB_TOKEN: "<token>",
   GITHUB_ORGANIZATION: "<organization-name>",
   GITHUB_REPO: "<repo-name>"
}
```

Command line args
Only include working hours by passing in `-w`
Number of PRs (up to 100, default 1) `-p`

Install:
`npm install`

Run examples:
`node index.js`
`node index.js -w -p 100`

Some considerations to take into account:
Github api has no way of telling how long a PR is in Draft mode.