import { useRef, useState } from "react";
import { bowlCreationService } from "../lib/createBowl";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";

export default function useCreateBowl({
  ownedBowlCount,
  refresh,
  service = bowlCreationService,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [bowlName, setBowlName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const createInFlight = useRef(null);
  const isLimitReached = ownedBowlCount >= MAX_BOWLS_PER_USER;

  const open = () => {
    if (isLimitReached) {
      setErrorMessage(`You can create up to ${MAX_BOWLS_PER_USER} bowls.`);
      setActionMessage(null);
      return;
    }
    setErrorMessage(null);
    setActionMessage(null);
    setIsOpen(true);
  };

  const close = () => {
    setBowlName("");
    setInviteEmails("");
    setErrorMessage(null);
    setActionMessage(null);
    setIsOpen(false);
  };

  const create = () => {
    if (createInFlight.current) return createInFlight.current;

    setErrorMessage(null);
    setActionMessage(null);
    setIsCreating(true);

    const input = { bowlName, inviteEmails, ownedBowlCount };
    // Start in a microtask so the promise guard is installed before injected
    // services can resolve or throw, closing the rapid Enter/click race.
    const operation = Promise.resolve()
      .then(() => service.create(input))
      .then(async (result) => {
        setErrorMessage(result.errorMessage);
        setActionMessage(result.actionMessage);

        if (!result.ok) return result;

        await refresh({ force: true });
        setBowlName("");
        setInviteEmails("");
        setIsOpen(false);
        return result;
      })
      .finally(() => {
        createInFlight.current = null;
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
