import { supabase } from './supabase'

// Gère l'accès aux profils via Supabase (fonctions RPC).
// Chaque profil est identifié par un CODE secret qui sert de clé d'accès.

export async function createProfile(code, name, aircraft) {
  const { data, error } = await supabase.rpc('create_profile', {
    p_code: code,
    p_name: name,
    p_aircraft: aircraft,
  })
  if (error) throw error
  if (data?.error === 'code_exists') {
    throw new Error('code_exists')
  }
  if (data?.error === 'code_too_short') {
    throw new Error('code_too_short')
  }
  return data
}

export async function getProfile(code) {
  const { data, error } = await supabase.rpc('get_profile', { p_code: code })
  if (error) throw error
  if (data?.error === 'locked') return { locked: true }
  if (data?.error === 'pending') return { pending: true }
  if (data?.error === 'not_found') return null
  return data
}

export async function profileExists(code) {
  const { data, error } = await supabase.rpc('profile_exists', { p_code: code })
  if (error) throw error
  return data
}

export async function checkAdmin(code) {
  const { data, error } = await supabase.rpc('check_admin', { p_code: code })
  if (error) throw error
  return data
}

export async function setAdminCode(oldCode, newCode) {
  const { data, error } = await supabase.rpc('set_admin_code', {
    p_old: oldCode,
    p_new: newCode,
  })
  if (error) throw error
  return data
}

export async function listProfiles(adminCode) {
  const { data, error } = await supabase.rpc('admin_list_profiles', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminDeleteProfile(adminCode, id) {
  const { data, error } = await supabase.rpc('admin_delete_profile', {
    p_admin_code: adminCode,
    p_id: id,
  })
  if (error) throw error
  return data
}

export async function adminUpdateProfile(adminCode, id, name, aircraft) {
  const { data, error } = await supabase.rpc('admin_update_profile', {
    p_admin_code: adminCode,
    p_id: id,
    p_name: name,
    p_aircraft: aircraft,
  })
  if (error) throw error
  return data
}

export async function adminCreateProfile(adminCode, code, name, aircraft) {
  const { data, error } = await supabase.rpc('admin_create_profile', {
    p_admin_code: adminCode,
    p_code: code,
    p_name: name,
    p_aircraft: aircraft,
  })
  if (error) throw error
  return data
}

export async function adminSetProfileAircraft(adminCode, profileCode, aircraft) {
  const { data, error } = await supabase.rpc('admin_set_profile_aircraft', {
    p_admin_code: adminCode,
    p_profile_code: profileCode,
    p_aircraft: aircraft,
  })
  if (error) throw error
  return data
}

export async function requestProfile(code, name, managerId) {
  const { data, error } = await supabase.rpc('request_profile', {
    p_code: code,
    p_name: name,
    p_manager_id: managerId,
  })
  if (error) throw error
  return data
}

export async function adminListPendingProfiles(adminCode) {
  const { data, error } = await supabase.rpc('admin_list_pending_profiles', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminValidateProfile(adminCode, profileCode) {
  const { data, error } = await supabase.rpc('admin_validate_profile', {
    p_admin_code: adminCode,
    p_profile_code: profileCode,
  })
  if (error) throw error
  return data
}

export async function adminRefuseProfile(adminCode, profileCode) {
  const { data, error } = await supabase.rpc('admin_refuse_profile', {
    p_admin_code: adminCode,
    p_profile_code: profileCode,
  })
  if (error) throw error
  return data
}

export async function adminGetProfileData(adminCode, id) {
  const { data, error } = await supabase.rpc('admin_get_profile_data', {
    p_admin_code: adminCode,
    p_id: id,
  })
  if (error) throw error
  return data
}

export async function adminListAdmins(adminCode) {
  const { data, error } = await supabase.rpc('admin_list_admins', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminAddAdmin(adminCode, newCode, newName) {
  const { data, error } = await supabase.rpc('admin_add_admin', {
    p_admin_code: adminCode,
    p_new_code: newCode,
    p_new_name: newName,
  })
  if (error) throw error
  return data
}

export async function adminRemoveAdmin(adminCode, targetCode) {
  const { data, error } = await supabase.rpc('admin_remove_admin', {
    p_admin_code: adminCode,
    p_target_code: targetCode,
  })
  if (error) throw error
  return data
}

export async function adminPurgeConsignes(adminCode, profileId) {
  const { data, error } = await supabase.rpc('admin_purge_consignes', {
    p_admin_code: adminCode,
    p_id: profileId,
  })
  if (error) throw error
  return data
}

export async function adminListDeclarations(adminCode, statut = '') {
  const { data, error } = await supabase.rpc('admin_list_declarations', {
    p_admin_code: adminCode,
    p_statut: statut,
  })
  if (error) throw error
  return data
}

export async function adminValidateDeclaration(adminCode, id, categorie) {
  const { data, error } = await supabase.rpc('admin_validate_declaration', {
    p_admin_code: adminCode,
    p_id: id,
    p_categorie: categorie,
  })
  if (error) throw error
  return data
}

export async function adminRefuseDeclaration(adminCode, id, motif) {
  const { data, error } = await supabase.rpc('admin_refuse_declaration', {
    p_admin_code: adminCode,
    p_id: id,
    p_motif: motif,
  })
  if (error) throw error
  return data
}

export async function adminPendingPrimesCount(adminCode) {
  const { data, error } = await supabase.rpc('admin_pending_primes_count', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminListAgents(adminCode) {
  const { data, error } = await supabase.rpc('admin_list_agents', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminSetAgentActif(adminCode, identifiant, actif) {
  const { data, error } = await supabase.rpc('admin_set_agent_actif', {
    p_admin_code: adminCode,
    p_identifiant: identifiant,
    p_actif: actif,
  })
  if (error) throw error
  return data
}

export async function adminDeleteAgent(adminCode, identifiant) {
  const { data, error } = await supabase.rpc('admin_delete_agent', {
    p_admin_code: adminCode,
    p_identifiant: identifiant,
  })
  if (error) throw error
  return data
}

export async function listManagers() {
  const { data, error } = await supabase.rpc('list_managers')
  if (error) throw error
  return data
}

export async function adminSetAgentManager(adminCode, identifiant, managerId) {
  const { data, error } = await supabase.rpc('admin_set_agent_manager', {
    p_admin_code: adminCode,
    p_identifiant: identifiant,
    p_manager_id: managerId || null,
  })
  if (error) throw error
  return data
}

export async function adminGetNotifyInfo(adminCode) {
  const { data, error } = await supabase.rpc('admin_get_notify_info', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function adminSetMyEmail(adminCode, email) {
  const { data, error } = await supabase.rpc('admin_set_my_email', {
    p_admin_code: adminCode,
    p_email: email,
  })
  if (error) throw error
  return data
}

export async function adminSetNotifyConfig(adminCode, apiKey, fromEmail) {
  const { data, error } = await supabase.rpc('admin_set_notify_config', {
    p_admin_code: adminCode,
    p_api_key: apiKey,
    p_from: fromEmail,
  })
  if (error) throw error
  return data
}

export async function adminTestEmail(adminCode) {
  const { data, error } = await supabase.rpc('admin_test_email', {
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function getConsignes() {
  const { data, error } = await supabase.rpc('get_consignes')
  if (error) throw error
  return data
}

export async function addConsigne(dossierId, titre, couleur, contenu, contenuHtml, updatedBy, auteurKey) {
  const { data, error } = await supabase.rpc('add_consigne', {
    p_dossier_id: dossierId,
    p_titre: titre,
    p_couleur: couleur,
    p_contenu: contenu,
    p_contenu_html: contenuHtml,
    p_updated_by: updatedBy,
    p_auteur_key: auteurKey,
  })
  if (error) throw error
  return data
}

export async function saveConsigne(id, titre, couleur, updatedBy) {
  const { data, error } = await supabase.rpc('save_consigne', {
    p_id: id,
    p_titre: titre,
    p_couleur: couleur,
    p_updated_by: updatedBy,
  })
  if (error) throw error
  return data
}

export async function getFolders() {
  const { data, error } = await supabase.rpc('get_folders')
  if (error) throw error
  return data
}

export async function addFolder(parentId, name, couleur, createdBy) {
  const { data, error } = await supabase.rpc('add_folder', {
    p_parent_id: parentId,
    p_name: name,
    p_couleur: couleur,
    p_created_by: createdBy,
  })
  if (error) throw error
  return data
}

export async function renameFolder(id, name) {
  const { data, error } = await supabase.rpc('rename_folder', {
    p_id: id,
    p_name: name,
  })
  if (error) throw error
  return data
}

export async function deleteFolder(id) {
  const { data, error } = await supabase.rpc('delete_folder', { p_id: id })
  if (error) throw error
  return data
}

export async function deleteConsigne(id) {
  const { data, error } = await supabase.rpc('delete_consigne', { p_id: id })
  if (error) throw error
  return data
}

export async function getMessages(dossierId) {
  const { data, error } = await supabase.rpc('get_messages', {
    p_dossier_id: String(dossierId),
  })
  if (error) throw error
  return data
}

export async function addMessage(dossierId, contenu, contenuHtml, images, auteur, auteurKey) {
  const { data, error } = await supabase.rpc('add_message', {
    p_dossier_id: String(dossierId),
    p_contenu: contenu,
    p_contenu_html: contenuHtml,
    p_images: images,
    p_auteur: auteur,
    p_auteur_key: auteurKey,
  })
  if (error) throw error
  return data
}

export async function deleteMessage(id, auteurKey, adminCode) {
  const { data, error } = await supabase.rpc('delete_message', {
    p_id: id,
    p_auteur_key: auteurKey,
    p_admin_code: adminCode,
  })
  if (error) throw error
  return data
}

export async function saveProfileData(code, dataObj, rev = 0, force = false) {
  const { data, error } = await supabase.rpc('save_profile_data', {
    p_code: code,
    p_data: dataObj,
    p_rev: rev,
    p_force: force,
  })
  if (error) throw error
  return data
}

export async function updateProfileMeta(code, name, aircraft) {
  const { data, error } = await supabase.rpc('update_profile_meta', {
    p_code: code,
    p_name: name,
    p_aircraft: aircraft,
  })
  if (error) throw error
  return data
}

export async function deleteProfile(code) {
  const { data, error } = await supabase.rpc('delete_profile', { p_code: code })
  if (error) throw error
  return !!data
}
