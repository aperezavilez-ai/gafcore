-- E4: agente webhook de prueba (eco en /api/extensions/v1/agent-echo).

DO $$
DECLARE
  v_pub uuid;
  v_listing uuid;
  v_version uuid;
  v_manifest jsonb;
  v_webhook text;
BEGIN
  SELECT id INTO v_pub FROM public.gafcore_publishers WHERE slug = 'gafcore-labs';
  IF v_pub IS NULL THEN RETURN; END IF;

  v_webhook := coalesce(
    nullif(trim(current_setting('app.settings.site_url', true)), ''),
    'https://gafcore.com'
  ) || '/api/extensions/v1/agent-echo';

  v_manifest := jsonb_build_object(
    'kind', 'agent',
    'version', 1,
    'slug', 'echo-webhook-test',
    'name', 'Agente echo (prueba)',
    'description', 'Envía un POST de prueba y recibe eco JSON. Notifica al completar workflows.',
    'hooks', jsonb_build_array('workflow_complete', 'workflow_failed'),
    'runner', 'webhook',
    'webhookUrl', 'https://gafcore.com/api/extensions/v1/agent-echo',
    'canWriteFiles', false
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order
  )
  VALUES (
    v_pub, 'echo-webhook-test', 'Agente echo (prueba)',
    'Webhook de prueba integrado en GafCore.', 'agent', 'published', '1.0.0', 50
  )
  ON CONFLICT (slug) DO UPDATE SET state = 'published', name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-agent-echo-v1')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;
END $$;
