import CheckCircleIcon from "@astraicons/react/bold/CheckCircleIcon";
import CloseCircleIcon from "@astraicons/react/bold/CloseCircleIcon";
import CopyIcon from "@astraicons/react/bold/CopyIcon";
import InfoIcon from "@astraicons/react/bold/InfoIcon";
import LockSlashIcon from "@astraicons/react/bold/LockSlashIcon";
import RefreshCcwIcon from "@astraicons/react/bold/RefreshCcwIcon";
import LockIcon from "@astraicons/react/bold/LockIcon";
import Shield2Icon from "@astraicons/react/bold/Shield2Icon";

const base = "h-full w-full";

export const SuccessIcon = () => <CheckCircleIcon className={base} />;
export const ErrorIcon = () => <CloseCircleIcon className={base} />;
export const CopyGlyph = () => <CopyIcon className={base} />;
export const InfoGlyph = () => <InfoIcon className={base} />;
export const NotConnectedIcon = () => <LockSlashIcon className={base} />;
export const RetryIcon = () => <RefreshCcwIcon className={base} />;
export const PrivacyIcon = () => <LockIcon className={base} />;
export const SensitiveIcon = () => <Shield2Icon className={base} />;
