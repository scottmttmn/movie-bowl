import { useRef, useState } from "react";
import { bowlCreationService, createBowlResult, UNKNOWN_CREATE_MESSAGE } from "../lib/createBowl";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";

export default function useCreateBowl({
  ownedBowlCount,
  refresh,
  service = bowlCreationService,
  bowlIdFactory = () => crypto.randomUUID(),
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [bowlName, setBowlName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const createInFlight = useRef(null);
  const abandonedOperation = useRef(null);
  // Held while an attempt's outcome is unknown, so the next attempt resends the
  // same bowl id and gets back the bowl the first one may have made, even
  // across closing and reopening the dialog. Any answer releases it.
  const uncertainBowlId = useRef(null);
  const isLimitReached = ownedBowlCount >= MAX_BOWLS_PER_USER;

  const open = () => {
    if (createInFlight.current) return false;
    if (isLimitReached) {
      setErrorMessage(`You can create up to ${MAX_BOWLS_PER_USER} bowls.`);
      setActionMessage(null);
      return false;
    }
    setErrorMessage(null);
    setActionMessage(null);
    setIsOpen(true);
    return true;
  };

  const close = () => {
    if (createInFlight.current) abandonedOperation.current = createInFlight.current;
    setBowlName("");
    setInviteEmails("");
    setErrorMessage(null);
    setActionMessage(null);
    setIsOpen(false);
    return true;
  };

  const create = () => {
    if (createInFlight.current) return createInFlight.current;

    setErrorMessage(null);
    setActionMessage(null);
    setIsCreating(true);

    const bowlId = uncertainBowlId.current || bowlIdFactory();
    uncertainBowlId.current = bowlId;
    const input = { bowlName, inviteEmails, ownedBowlCount, bowlId };
    // Start in a microtask so the promise guard is installed before injected
    // services can resolve or throw, closing the rapid Enter/click race.
    const operation = Promise.resolve()
      .then(() => service.create(input))
      .then(async (result) => {
        if (result.code !== "outcome_unknown") uncertainBowlId.current = null;
        if (abandonedOperation.current !== operation) {
          setErrorMessage(result.errorMessage);
          setActionMessage(result.actionMessage);
        }

        if (!result.ok) return result;

        await refresh({ force: true });
        if (abandonedOperation.current !== operation) {
          setBowlName("");
          setInviteEmails("");
          setIsOpen(false);
        }
        return result;
      })
      .catch((error) => {
        console.error("[useCreateBowl] Unexpected creation failure", error);
        const result = createBowlResult({
          ok: false,
          code: "outcome_unknown",
          errorMessage: UNKNOWN_CREATE_MESSAGE,
        });
        if (abandonedOperation.current !== operation) {
          setErrorMessage(result.errorMessage);
          setActionMessage(null);
        }
        return result;
      })
      .finally(() => {
        if (createInFlight.current === operation) createInFlight.current = null;
        if (abandonedOperation.current === operation) abandonedOperation.current = null;
        setIsCreating(false);
      });

    createInFlight.current = operation;
    return operation;
  };

  return {
    actionMessage,
    bowlName,
    close,
    create,
    errorMessage,
    inviteEmails,
    isCreating,
    isLimitReached,
    isOpen,
    open,
    setBowlName,
    setInviteEmails,
  };
}
