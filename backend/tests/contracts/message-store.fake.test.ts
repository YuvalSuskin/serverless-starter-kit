// Skeleton: the template's demo store, replaced by bootstrap step 6.
import { fakeMessageStore } from "../../src/fakes/message-store";
import { recordingUsage } from "../support/recording-usage";
import { messageStoreContract } from "./message-store.contract";

messageStoreContract("fake", () => {
  const { records, usage } = recordingUsage();
  return { metered: () => records, store: fakeMessageStore(usage) };
});
