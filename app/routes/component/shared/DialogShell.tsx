import type { ReactNode } from "react";
import { Modal } from "antd";

type DialogShellProps = {
  open: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  width?: number;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  destroyOnHidden?: boolean;
  className?: string;
};

export function DialogShell({
  open,
  onClose,
  closeDisabled = false,
  width = 460,
  title,
  description,
  children,
  footer,
  destroyOnHidden = true,
  className,
}: DialogShellProps) {
  return (
    <Modal
      open={open}
      onCancel={() => {
        if (!closeDisabled) onClose();
      }}
      footer={null}
      className={["spark-ant-modal", "spark-dialog-shell", className].filter(Boolean).join(" ")}
      destroyOnHidden={destroyOnHidden}
      mask={{ closable: !closeDisabled }}
      closable={!closeDisabled}
      keyboard={!closeDisabled}
      width={width}
    >
      <div className="spark-dialog-shell__content">
        <div className="spark-dialog-shell__header">
          <div className="spark-dialog-shell__title">{title}</div>
          {description ? <div className="spark-dialog-shell__description">{description}</div> : null}
        </div>
        {children ? <div className="spark-dialog-shell__body">{children}</div> : null}
        {footer ? <div className="spark-dialog-shell__footer">{footer}</div> : null}
      </div>
    </Modal>
  );
}
