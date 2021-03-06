import { createTestCluster } from "../utils";

import {
  readEventsFromStream,
  writeEventsToStream,
  EventStoreConnection,
  EventData,
  FOLLOWER,
  ErrorType,
  NotLeaderError,
} from "../..";

describe("not-leader", () => {
  const cluster = createTestCluster();
  const STREAM_NAME = "test_stream_name";
  const event = EventData.json("test", { message: "test" });

  beforeAll(async () => {
    await cluster.up();
  });

  afterAll(async () => {
    await cluster.down();
  });

  test("should get an error here", async () => {
    const connection = EventStoreConnection.builder()
      .sslRootCertificate(cluster.certPath)
      .gossipClusterConnection(cluster.endpoints, FOLLOWER);

    const writeResult = await writeEventsToStream(STREAM_NAME)
      .send(event.build())
      .execute(connection);

    expect(writeResult).toBeDefined();

    const readFromStream = readEventsFromStream(STREAM_NAME)
      .count(10)
      .backward()
      .fromEnd()
      .requiresLeader();

    try {
      const readResult = await readFromStream.execute(connection);

      expect(readResult).toBe("unreachable");
    } catch (error) {
      expect(error).toBeInstanceOf(NotLeaderError);

      if (error instanceof NotLeaderError) {
        expect(error.type).toBe(ErrorType.NOT_LEADER);
        expect(error.leader).toBeDefined();
        expect(cluster.endpoints).toContainEqual(error.leader);

        const connection = EventStoreConnection.builder()
          .sslRootCertificate(cluster.certPath)
          .singleNodeConnection(error.leader);

        const readResult = await readFromStream.execute(connection);

        expect(readResult).toBeDefined();
      }
    }
  });
});
