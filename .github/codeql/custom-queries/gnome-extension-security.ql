/**
 * @name GNOME Extension Security Check
 * @description Detects common security issues in GNOME Shell extensions
 * @kind problem
 * @problem.severity error
 * @security-severity 8.0
 * @precision high
 * @id js/gnome-extension-security
 * @tags security
 *       gnome-shell
 *       extensions
 */

import javascript
import semmle.javascript.security.dataflow.UnsafeDeserializationQuery
import semmle.javascript.security.dataflow.CommandInjectionQuery

/**
 * Detects unsafe use of Shell.get_file_contents_utf8_sync
 */
class UnsafeFileRead extends DataFlow::Node {
  UnsafeFileRead() {
    exists(CallExpr call |
      call.getCalleeName() = "get_file_contents_utf8_sync" and
      this = DataFlow::exprNode(call)
    )
  }
}

/**
 * Detects unsafe use of GLib.spawn_command_line_sync
 */
class UnsafeCommandExecution extends DataFlow::Node {
  UnsafeCommandExecution() {
    exists(CallExpr call |
      call.getCalleeName() = "spawn_command_line_sync" and
      this = DataFlow::exprNode(call)
    )
  }
}

/**
 * Detects unsafe settings access without schema validation
 */
class UnsafeSettingsAccess extends DataFlow::Node {
  UnsafeSettingsAccess() {
    exists(CallExpr call |
      call.getCalleeName() = "get_string" and
      not exists(MethodCallExpr validate |
        validate.getMethodName() = "get_schema" and
        validate.getReceiver() = call.getReceiver()
      )
    )
  }
}

from DataFlow::Node source
where
  source instanceof UnsafeFileRead or
  source instanceof UnsafeCommandExecution or
  source instanceof UnsafeSettingsAccess
select source, "Potentially unsafe operation in GNOME extension" 