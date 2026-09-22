-- ============================================================
-- AeroPrimes — le mail immédiat « nouvelle déclaration » est remplacé
-- par un RÉCAP MENSUEL (le 1er du mois).
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
--
-- 1) Le déclencheur qui envoyait un email à CHAQUE déclaration soumise
--    est retiré : les managers ne reçoivent plus un mail par prime.
-- 2) Le récap mensuel (le 1er du mois, avec le fichier Excel et le
--    récap par agent dans le corps, envoyé à l'adresse manager) est
--    en attente du moyen d'envoi (EmailJS gratuit ne joint pas de
--    fichier ; Gmail SMTP recommandé — mot de passe d'application).
--
-- Pour revenir en arrière (réactiver le mail immédiat) :
--   create trigger trg_notify_manager_new_prime
--     after insert on public.declarations
--     for each row execute function public.notify_manager_new_prime();
-- ============================================================

drop trigger if exists trg_notify_manager_new_prime on public.declarations;
