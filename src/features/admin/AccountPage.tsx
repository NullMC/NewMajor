import { PageHeader } from '@/components/ui/Display'
import ProfilePage from '@/features/account/ProfilePage'

/** Dati e password dell'amministratore, senza passare dall'area cliente. */
export default function AdminAccountPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Il mio account" description="Dati personali e password di accesso al backoffice." />
      <ProfilePage />
    </div>
  )
}
