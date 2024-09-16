
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

The mainlineMergeFrequency.js will report the following:

* **Number of merges to master:** Number of merged pull requests to master per day


# Setup

If needed, create a personal access token at https://github.com/settings/tokens/new?scopes=repo. 
Scopes needed:
* Full repo
* read:org
* read:user
* read:discussion
* read:project

Create a config.js file with the following format:

```
module.exports = {
	GITHUB_TOKEN: "<token>",
	GITHUB_ORGANIZATION: "<organization-name>",
	GITHUB_REPO: "<repo-name>"
}
```

# Managing runtimes
We use [`asdf`](https://asdf-vm.com/) to manage the Deno version. `asdf` is a CLI tool that can manage multiple language runtime versions on a per-project basis.

Start by installing asdf:
```sh
brew install asdf
echo -e "\n. $(brew --prefix asdf)/libexec/asdf.sh" >> ${ZDOTDIR:-~}/.zshrc
```

Then install the asdf-deno plugin:
```sh
asdf plugin-add deno https://github.com/asdf-community/asdf-deno.git
```

Finally, install the versions specified in [`.tool-versions`](/.tool-versions) with a single command:
```sh
asdf install
```
Now if you run `asdf current` you should see the installed Node versions.

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


# Running mainlineMergeFrequency.js

Command line args
* `-p ##`: Number of weeks to include (Default is 1 weeks)
* `-t <team-name>`: Only include PRs for specified team (default is everyone)
* `-b <branch-name>`: mainline branch, defaults to "main"
* `-f <file-prefix>`: Append a file prefix to results

Install: `npm install`
Run examples: 
`node mainlineMergeFrequency.js`
`node mainlineMergeFrequency.js -p 8`