# Contributing

## Where I need help

- **Feedback:** First and foremost, send me feedback. What makes sense? What's confusing? What's missing? What's broken? [Send me an email](pmcelhaney@gmail.com), [open an issue](https://github.com/pmcelhaney/counterfact/issues/new), or [start a discussion](https://github.com/pmcelhaney/counterfact/discussions).
- **Documentation:** There are probably typos in this very document. Please send PRs, large and small. You can do it right from your browser. If you're viewing this document in GitHub, click the pencil button in the top right corner.
- **Graphic design:** I'm terrible at graphic design. I know good design when I see it, and I can tell you why it's good, but struggle with the creative process. Whether it's building a web site, designing a logo, brainstorming on a GUI, or fixing up some ugly Markdown code, I'll take whatever help I can get!
- **Tests:** Test coverage is pretty good, but there are gaps. Filling those gaps is an easy way to gain some familiarity with the codebase.
- **Code Generation:** As of this writing, the code that writes the code works okay, but it's kind of sloppy. Instead of printing strings of source code directly, I'd like to refactor everything to build ASTs. I'd also like to bring in [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript), which is more accurate than my hand-rolled MVP.
- **Convert to TypeScript**: While Counterfact generates and runs TypeScript, ironically the code itself is in JavaScript. That's partly because running the unit tests in Jest requires [--experimental-vm-modules](https://jestjs.io/docs/ecmascript-modules). Getting Jest working with that and TypeScript at the same time was too much trouble when the project was getting off the ground.
- **New features and bug fixes:** See the [issues list](https://github.com/pmcelhaney/counterfact/issues). If you plan on working on something, please add a comment and/or assign yourself.
- **Spread the word!** If you find this project useful, please let others know about it. Share it in your team Slack, on social media, etc.

## Development

This is a Yarn 1 workspace monorepo. The published application is in
`packages/counterfact`; repository-wide tooling, examples, black-box tests, and
the documentation website remain at the root.

```sh
git clone git@github.com:pmcelhaney/counterfact.git
cd counterfact
yarn install
yarn lint
yarn test
```

The [code generator](./packages/counterfact/src/typescript-generator/README.md)
and server runtime are currently part of the `counterfact` workspace. Root
scripts coordinate builds and checks, so contributors do not need to change
directories for the standard workflow.

Testing and linting changes is important, but at this point I'm more concerned about changing the word "I" in this page to "we", so don't hesitate to create a PR, even it's not "finished".

Thanks in advance!
