import { ClientReadableStream } from "grpc";
import { ReadResp } from "../../../generated/streams_pb";
import {
  SubscriptionHandler,
  RecordedEvent,
  convertGrpcRecord,
  ResolvedEvent,
  SubscriptionReport,
  ReadStreamResult,
  ReadStreamSuccess,
  ReadStreamNotFound,
} from "../../types";

export class SubscriptionReportImpl implements SubscriptionReport {
  private _stream: ClientReadableStream<ReadResp>;

  constructor(stream: ClientReadableStream<ReadResp>) {
    this._stream = stream;
  }
  unsubcribe(): void {
    this._stream.cancel();
  }
}

export function handleOneWaySubscription(
  stream: ClientReadableStream<ReadResp>,
  handler: SubscriptionHandler
): void {
  const report = new SubscriptionReportImpl(stream);

  stream.on("data", (resp: ReadResp) => {
    if (resp.hasConfirmation() && handler.onConfirmation)
      handler.onConfirmation();

    if (resp.hasEvent()) {
      let event: RecordedEvent | undefined;
      let link: RecordedEvent | undefined;

      const grpcEvent = resp.getEvent();

      if (resp.hasEvent() && grpcEvent) {
        let grpcRecordedEvent = grpcEvent.getEvent();
        if (grpcEvent.hasEvent() && grpcRecordedEvent) {
          event = convertGrpcRecord(grpcRecordedEvent);
        }

        grpcRecordedEvent = grpcEvent.getLink();
        if (grpcEvent.hasLink() && grpcRecordedEvent) {
          link = convertGrpcRecord(grpcRecordedEvent);
        }

        const resolved: ResolvedEvent = {
          event,
          link,
          commit_position: grpcEvent.getCommitPosition(),
        };

        handler.onEvent(report, resolved);
      }
    }
  });

  stream.on("end", () => {
    handler.onEnd?.();
  });

  stream.on("error", (error) => {
    handler.onError?.(error);
  });
}

export function handleBatchRead(
  stream: ClientReadableStream<ReadResp>
): Promise<ReadStreamResult> {
  return new Promise<ReadStreamResult>((resolve, reject) => {
    const buffer: ResolvedEvent[] = [];
    let found = true;

    stream.on("data", (resp: ReadResp) => {
      if (resp.hasStreamNotFound()) {
        found = false;
      } else {
        let event: RecordedEvent | undefined;
        let link: RecordedEvent | undefined;

        const grpcEvent = resp.getEvent();
        if (resp.hasEvent() && grpcEvent) {
          let grpcRecordedEvent = grpcEvent.getEvent();

          if (grpcEvent.hasEvent() && grpcRecordedEvent) {
            event = convertGrpcRecord(grpcRecordedEvent);
          }

          grpcRecordedEvent = grpcEvent.getLink();
          if (grpcEvent.hasLink() && grpcRecordedEvent) {
            link = convertGrpcRecord(grpcRecordedEvent);
          }

          const resolved: ResolvedEvent = {
            event,
            link,
            commit_position: grpcEvent.getCommitPosition(),
          };

          buffer.push(resolved);
        }
      }
    });

    stream.on("end", () => {
      if (found) {
        const result: ReadStreamSuccess = {
          __typename: "success",
          events: buffer,
        };

        resolve(result);
      } else {
        resolve(ReadStreamNotFound);
      }
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}