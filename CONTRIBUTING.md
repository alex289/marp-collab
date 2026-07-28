# Contributing

Any contribution is greatly appreciated. You don't need to be a developer to contribute. You can help by translating the app, reporting issues, or simply sharing your ideas for new features.

If you have any questions, please do not hesitate to contact us.

Read our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

## Security

If you would like to report a security vulnerability, please take a look at [SECURITY.md](SECURITY.md)

## Code contributions

We welcome code contributions and encourage clear, well-documented changes that include appropriate tests.
When introducing a new feature, please ensure you add relevant tests.
For breaking changes or major new features, open an issue beforehand to discuss your proposal with the team.

### Required tools

| Tool                           | Version       | Purpose         |
| ------------------------------ | ------------- | --------------- |
| [Node.js](https://nodejs.org/) | 24.x or 26.x  | Runtime         |
| [pnpm](https://pnpm.io/)       | 11.x or newer | Package manager |

### Setting up the development environment

1. Install all required tools listed above.
2. Clone the repository and navigate to the project directory.
3. Install the depencies with `pnpm i --frozen-lockfile` from the root of the project.
4. Copy the `.env.example` file in the `backend/` directory to `.env` and adjust any necessary environment variables.
5. Run the project with `pnpm dev` from the root of the project.
6. Access the app at `http://localhost:5173`.

### Running locally with Docker

A Docker Compose file is provided for running the full stack locally:

```sh
docker compose -f docker-compose.dev.yml up --build
```

The app will be available at `http://localhost:8787`.
