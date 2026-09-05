import {
  HostlyPlanIdentityBase,
  type HostlyPlanIdentityProps,
} from "./HostlyPlanIdentityBase";
import styles from "./HostlyPlanIdentity.module.css";

export type { HostlyPlanIdentityProps } from "./HostlyPlanIdentityBase";

export function HostlyPlanIdentity(props: HostlyPlanIdentityProps) {
  return <HostlyPlanIdentityBase {...props} classNames={styles} />;
}
