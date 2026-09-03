// semantic-release configuration for this personal fork.
//
// This fork is not published to npm (package.json is "private": true) -- the
// supported install path is build-from-source (see README's Install
// section). semantic-release still runs on every merge to main that includes
// a feat / fix / perf / revert commit, but only to produce a version bump,
// changelog, and tagged GitHub Release. That tag is the pinned, reviewable
// artifact operators should install from.
//
// Repository URL is inferred from package.json. Do NOT hardcode it here --
// merging from upstream is easier when this file does not diverge.

const allowMajorRelease = process.env.WORKRAIL_ALLOW_MAJOR_RELEASE === "true";
const breakingReleaseType = allowMajorRelease ? "major" : "minor";

module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "revert", release: "patch" },
          { type: "docs", release: false },
          { type: "style", release: false },
          { type: "chore", release: false },
          { type: "refactor", release: false },
          { type: "test", release: false },
          { type: "build", release: false },
          { type: "ci", release: false },
          { breaking: true, release: breakingReleaseType }
        ]
      }
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: [
            { type: "feat", section: "Features" },
            { type: "fix", section: "Bug Fixes" },
            { type: "perf", section: "Performance Improvements" },
            { type: "revert", section: "Reverts" },
            { type: "docs", section: "Documentation", hidden: true },
            { type: "style", section: "Styles", hidden: true },
            { type: "chore", section: "Miscellaneous Chores", hidden: true },
            { type: "refactor", section: "Code Refactoring", hidden: true },
            { type: "test", section: "Tests", hidden: true },
            { type: "build", section: "Build System", hidden: true },
            { type: "ci", section: "Continuous Integration", hidden: true }
          ]
        }
      }
    ],
    [
      "@semantic-release/exec",
      {
        // No @semantic-release/npm plugin (nothing publishes to a registry),
        // so this is the only thing that writes the version into
        // package.json before the git/github plugins tag and release it.
        prepareCmd: "npm pkg set version=${nextRelease.version}"
      }
    ],
    "@semantic-release/github"
  ]
};
