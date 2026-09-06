import { PosLayoutMigrationPanel } from "./_components/pos-layout-migration-panel";
import { PosMigrationPageContent } from "./_components/pos-migration-page-content";

export default function ConfigCartaMigracionTpvPage() {
  return (
    <>
      <PosMigrationPageContent />
      <div className="mx-auto w-full max-w-[1600px] px-3 pb-6 sm:px-4 lg:px-6">
        <PosLayoutMigrationPanel />
      </div>
    </>
  );
}
