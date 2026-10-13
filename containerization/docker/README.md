# Docker

> **Maintained by:** Community contributors

Run the open-source Ory stack locally or in containerized deployments using the official Docker images at `oryd/kratos`, `oryd/hydra`, `oryd/keto`, `oryd/oathkeeper`. This directory points to the Docker Compose quickstarts that each product ships in its own repository.

**Type:** config (deployment pattern)
**Docs page:** [ory.com/docs/integrates-with/containerization/docker](https://www.ory.com/docs/integrates-with/containerization/docker)
- [Kratos install](https://www.ory.com/docs/oss/kratos/install)
- [Hydra quickstart](https://www.ory.com/docs/hydra/self-hosted/quickstart) (Docker Compose-based)
- [Keto install](https://www.ory.com/docs/oss/keto/install)
- [Oathkeeper install](https://www.ory.com/docs/oathkeeper/install)

## Docker Compose quickstarts

The [Kratos quickstart](https://www.ory.com/docs/oss/kratos/quickstart) and the [Hydra quickstart](https://www.ory.com/docs/hydra/self-hosted/quickstart) each start the product with Docker Compose from its repository. Useful for:

- Local development against a self-hosted stack.
- Reproducing CI failures locally.
- Trying out version upgrades before promoting to a real cluster.

For production, use the [Helm charts](../../iac-devops/helm/) — running these images with `docker run` or compose works but doesn't give you the lifecycle features (probes, rolling updates, secrets) you'll want.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
