
# About

The cycleTime.js will report the following individual PR and aggregated metrics:

* **Time to open:** Time from first commit to when PR is created
* **Time to first interaction:** Time from pr opening to the first collaborator interaction (any comment or review)
* **Time to merge:** Time from created to pr merge
* **Cycle time:** Time from first commit || pr created to close
* **Conversation break duration:** Duration of break between author/collaborator interactions
* **Conversation breaks:*** Number of conversation breaks that happen in a PR - breaks are defined by a switch in speaker
* **Number of PR commits**
* **Number of PR files, additions, and deletions**
* **Number of PR reviews**
* **Number of unreviewed PRs**

The deploymentFrequency.js will report the following:

* **Number of merges to master:** Number of merge commits to master per day

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

# Running cycleTime.js

Command line args
* `-w`: Only include working hours
* `-p ##`: Number of weeks to include (Default is 1 weeks)
* `-t <team-name>`: Only include PRs for specified team (default is everyone)
* `-f <file-prefix>`: Append a file prefix to results

Install: `npm install`
Run examples: 
`node cycleTime.js`
`node cycleTime.js -w -p 8`

## Considerations
* Github api has no way of telling how long a PR is in Draft mode. Metrics will include draft time.
* Only merged PRs will be included in metrics. You may ask for 100 PRs but receive less since some of them may have closed without being merged.
* Some prs have no interactions, such as when they are merged with no reviews or comments.
* When a PR is opened and later it's history is rewritten by a force push, the time to open will not be able to be calculated since the first commit may have been written after the PR is opened.
* Github reactions (aka emoji responses) are not included in calculations.


# Running deploymentFrequency.js

Command line args
* `-p ##`: Number of weeks to include (Default is 1 weeks)
* `-t <team-name>`: Only include PRs for specified team (default is everyone)
* `-f <file-prefix>`: Append a file prefix to results

Install: `npm install`
Run examples: 
`node deploymentFrequency.js`
`node deploymentFrequency.js -p 8`