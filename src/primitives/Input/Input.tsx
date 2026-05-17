import { useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import styles from "./Input.module.css";

type Props = {
  type: "username" | "email" | "password";
  value: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function Input({ type, value, onChange }: Props) {

  const [showPassword, setShowPassword] = useState(false);

  const config = useMemo(() => {
    switch (type) {
      case "username":
        return { inputType: "text", Icon: UserRound };

      case "email":
        return { inputType: "email", Icon: UserRound };

      case "password":
        return { inputType: showPassword ? "text" : "password", Icon: LockKeyhole };
    }
  }, [type, showPassword]);

  const { inputType, Icon } = config;

  return (
    <label className={styles.field}>
      <span className={styles.inputWrap}>
        <Icon className={styles.icon} strokeWidth={1.8} />
        <input
          className={styles.input}
          type={inputType}
          value={value}
          onChange={onChange}
        />

        {type === "password" && (
          <button type="button" className={styles.eyeButton} onClick={() => setShowPassword((prev) => !prev)}>
            {showPassword ? (
              <EyeOff className={styles.eye} strokeWidth={1.8} />
            ) : (
              <Eye className={styles.eye} strokeWidth={1.8} />
            )}
          </button>
        )}
      </span>
    </label>
  );
}
