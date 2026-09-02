import { useState } from "react";
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

  const create = async () => {
    setErrorMessage(null);
    setActionMessage(null);

    const result = await service.create({ bowlName, inviteEmails, ownedBowlCount });
    setErrorMessage(result.errorMessage);
    setActionMessage(result.actionMessage);

    if (!result.ok) return result;

    await refresh({ force: true });
    setBowlName("");
    setInviteEmails("");
    setIsOpen(false);
    return result;
  };

  return {
    actionMessage,
    bowlName,
    close,
    create,
    errorMessage,
    inviteEmails,
    isLimitReached,
    isOpen,
    open,
    setBowlName,
    setInviteEmails,
  };
}
