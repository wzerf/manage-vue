import type { Plugin } from 'vite';
export const FORM_FIELD_SLOT_MIGRATION_WARNING =
  '[Vben Form] BREAKING CHANGE: Named field slot control bindings moved to `slotProps.componentProps`. Replace `v-bind="slotProps"` with `v-bind="slotProps.componentProps"`. See https://doc.vben.pro/components/common-ui/vben-form.html';
export function viteFormFieldSlotMigrationWarningPlugin(): Plugin {
  return {
    name: 'vite:form-field-slot-migration-warning',
    apply() {
      return false;
    },
  } as unknown as Plugin;
}
