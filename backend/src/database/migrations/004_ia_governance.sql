-- IA & Editorial Governance v1.0. Additive only; never touches other databases.
ALTER TABLE conspace.cms_users ADD COLUMN IF NOT EXISTS person_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS cms_users_person_id_idx ON conspace.cms_users(person_id);

CREATE TABLE IF NOT EXISTS conspace.cms_user_roles (
  user_id uuid NOT NULL REFERENCES conspace.cms_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF')),
  granted_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  grant_source text NOT NULL CHECK(grant_source IN ('BASELINE_MIGRATION','ADMIN_ASSIGNMENT','LEGACY_ADMIN_COMPAT','BOOTSTRAP')),
  grant_reason text NOT NULL CHECK(length(btrim(grant_reason))>=3),
  legacy_compat boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,role)
);
CREATE INDEX IF NOT EXISTS cms_user_roles_role_user_idx ON conspace.cms_user_roles(role,user_id);

CREATE TABLE IF NOT EXISTS conspace.cms_user_permissions (
  user_id uuid NOT NULL REFERENCES conspace.cms_users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK(permission IN ('CONTENT_PUBLISH','CONTENT_WITHDRAW')),
  granted_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  grant_reason text NOT NULL CHECK(length(btrim(grant_reason))>=3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,permission)
);
CREATE INDEX IF NOT EXISTS cms_user_permissions_permission_user_idx ON conspace.cms_user_permissions(permission,user_id);

INSERT INTO conspace.cms_user_roles(user_id,role,granted_by_user_id,grant_source,grant_reason,legacy_compat)
SELECT id,role,created_by_user_id,'BASELINE_MIGRATION',
       'Primary CMS role migrated to explicit role membership under IA Governance v1.0',false
FROM conspace.cms_users
ON CONFLICT(user_id,role) DO NOTHING;

-- Preserve current active ADMIN operators with explicit, auditable legacy grants.
-- New ADMIN accounts receive ADMIN only; ADMIN does not inherit editorial roles.
INSERT INTO conspace.cms_user_roles(user_id,role,grant_source,grant_reason,legacy_compat)
SELECT u.id,legacy.role,'LEGACY_ADMIN_COMPAT',
       'Temporary compatibility grant until replacement editorial staff are provisioned',true
FROM conspace.cms_users u
CROSS JOIN (VALUES('EDITOR'),('TECHNICAL_REVIEWER'),('EDITOR_IN_CHIEF')) AS legacy(role)
WHERE u.role='ADMIN' AND u.is_active=true
ON CONFLICT(user_id,role) DO NOTHING;

INSERT INTO conspace.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
SELECT NULL,'LEGACY_ADMIN_EDITORIAL_ROLES_PRESERVED','CMS_USER',u.id,
       jsonb_build_object('primaryRole','ADMIN',
         'explicitCompatibilityRoles',jsonb_build_array('EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'),
         'grantSource','LEGACY_ADMIN_COMPAT',
         'reason','Preserve current operator access until staffed editorial roles are provisioned')
FROM conspace.cms_users u
WHERE u.role='ADMIN' AND u.is_active=true
  AND EXISTS(SELECT 1 FROM conspace.cms_user_roles r WHERE r.user_id=u.id AND r.grant_source='LEGACY_ADMIN_COMPAT');

ALTER TABLE conspace.niches ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'TEMPLATE_A';
UPDATE conspace.niches SET template_key=CASE WHEN group_type='design' THEN 'TEMPLATE_B' ELSE 'TEMPLATE_A' END;
ALTER TABLE conspace.niches ADD CONSTRAINT niches_template_group_check CHECK(
  (group_type='design' AND template_key='TEMPLATE_B') OR
  (group_type='construction' AND template_key='TEMPLATE_A')
);
CREATE INDEX IF NOT EXISTS niches_template_group_idx ON conspace.niches(group_type,template_key,sort_order) WHERE is_active=true;

UPDATE conspace.niche_template_blocks SET title='Làm gì/không làm; ai làm',
 source_description='IA Governance v1.0. Content must be source-backed.' WHERE section_no=1;
UPDATE conspace.niche_template_blocks SET title='Vị trí trong trình tự công trường',
 source_description='IA Governance v1.0. Architect layer requires sourced drawings and inspection hold points.' WHERE section_no=2;
UPDATE conspace.niche_template_blocks SET title='Nhu cầu thị trường',
 source_description='New editorial research. Cite current sources; do not invent market figures.' WHERE section_no=3;
UPDATE conspace.niche_template_blocks SET title='Cấu trúc giá và câu hỏi cần hỏi (không bịa con số)',
 source_description='No fabricated prices, rates or quantities.' WHERE section_no=4;
UPDATE conspace.niche_template_blocks SET title='Rẻ hơn mặt bằng thì cắt ở đâu (phân tích có nguồn)',
 source_description='Evidence-based analysis; do not invent market benchmarks.' WHERE section_no=5;
UPDATE conspace.niche_template_blocks SET title='Mặt trái ngành: cơ chế, không nêu tên; lý giải vì sao người làm tử tế không làm thế',
 source_description='Sensitive editorial content. Do not identify an entity; mandatory Editor-in-Chief review.' WHERE section_no=6;
UPDATE conspace.niche_template_blocks SET title='Nỗi đau chủ nhà',
 source_description='Must be based on verified reader or field evidence.' WHERE section_no=7;
UPDATE conspace.niche_template_blocks SET title='Nỗi đau nhà thầu ngách',
 source_description='Must be based on verified professional or field evidence.' WHERE section_no=8;
UPDATE conspace.niche_template_blocks SET title='Điểm giao/xung đột',
 source_description='Show both sides and cite claims.' WHERE section_no=9;
UPDATE conspace.niche_template_blocks SET title='Giải pháp và mốc ngăn ngừa',
 source_description='Architect layer includes sourced drawings and inspection hold points.' WHERE section_no=10;
UPDATE conspace.niche_template_blocks SET title='Dấu hiệu người biết việc, checklist nghiệm thu/bảo hành',
 source_description='Warranty periods and technical claims require current sources and Chief review.' WHERE section_no=11;
UPDATE conspace.niche_template_blocks SET title='Ghi chép hiện trường có xác nhận',
 source_description='Requires anonymization, image usage rights and technical review.' WHERE section_no=12;

INSERT INTO conspace.niche_template_layers(audience_role,section_no) VALUES
('homeowner',1),('homeowner',3),('homeowner',4),('homeowner',5),('homeowner',7),('homeowner',11),
('contractor',1),('contractor',6),('contractor',8),('contractor',9),('contractor',10),
('architect',2),('architect',9),('architect',10)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS conspace.architectural_template_blocks(
  section_no smallint PRIMARY KEY CHECK(section_no BETWEEN 1 AND 7),
  block_key text NOT NULL UNIQUE,title text NOT NULL,source_description text NOT NULL
);
INSERT INTO conspace.architectural_template_blocks(section_no,block_key,title,source_description) VALUES
(1,'building_type_boundary','Ranh giới loại công trình','IA Governance v1.0; source-backed editorial content.'),
(2,'architectural_characteristics','Đặc thù','IA Governance v1.0; source-backed editorial content.'),
(3,'related_niche_sequence','Chuỗi ngách','Link only verified active niches.'),
(4,'specific_standards_law','Quy chuẩn/pháp lý riêng','Current official sources and Chief review required.'),
(5,'specific_risks','Rủi ro','Cite verified technical/legal sources.'),
(6,'specialist_architect','KTS chuyên mảng','No invented credentials or profiles.'),
(7,'delegation_boundary','Năng lực/giới hạn giao việc','No contractor rankings or unsupported claims.')
ON CONFLICT(section_no) DO NOTHING;

CREATE TABLE IF NOT EXISTS conspace.architectural_sections(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id uuid NOT NULL REFERENCES conspace.niches(id) ON DELETE CASCADE,
  section_no smallint NOT NULL REFERENCES conspace.architectural_template_blocks(section_no) ON DELETE RESTRICT,
  content text NOT NULL DEFAULT '',source_ref text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED')),
  updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(niche_id,section_no)
);
CREATE INDEX IF NOT EXISTS architectural_sections_public_idx
ON conspace.architectural_sections(niche_id,section_no) WHERE status='PUBLISHED';
