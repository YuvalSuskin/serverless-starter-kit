import type { TestProject } from "vitest/node";

// Vitest globalSetup for the `contract` project: starts the
// emulators once per run and hands their endpoints to the tests. Without
// Docker the run FAILS -- it never skips, because a skipped suite is a false
// green. A resource that has a local emulator adds its container here (an
// S3-compatible store, say), beside DynamoDB Local.
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

// Pinned tags. Changing one is a reviewed change; it is part of this package's
// files, so it also invalidates turbo's cached test:contract result.
export const DYNAMODB_LOCAL_IMAGE = "amazon/dynamodb-local:3.3.1";

/** Placeholder credentials for an SDK client pointed at an emulator or a stand-in. */
export const TEST_CREDENTIALS = { accessKeyId: "test-key", secretAccessKey: "test-secret" };

declare module "vitest" {
  export interface ProvidedContext {
    dynamodbEndpoint: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let dynamodb: StartedTestContainer;
  try {
    dynamodb = await new GenericContainer(DYNAMODB_LOCAL_IMAGE)
      .withCommand(["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"])
      .withExposedPorts(8000)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
  } catch (error) {
    throw new Error(
      "test:contract could not start its emulators (DynamoDB Local). It needs " +
        "Docker running and able to pull the pinned images. It never skips.",
      { cause: error },
    );
  }

  project.provide(
    "dynamodbEndpoint",
    `http://${dynamodb.getHost()}:${dynamodb.getMappedPort(8000).toString()}`,
  );
  return async () => {
    await dynamodb.stop();
  };
}
