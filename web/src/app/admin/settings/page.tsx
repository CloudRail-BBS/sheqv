import { redirect } from 'next/navigation';

/** 设置拆成独立分区页；/admin/settings 固定进第一页 */
export default function AdminSettingsIndex() {
  redirect('/admin/settings/site');
}
