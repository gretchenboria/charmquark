-- CharmQuark — dummy dataset.
--
-- GENERATED FILE. Source of truth: api/src/seedData.ts.
-- Regenerate with:  npm run --prefix api db:seed:generate
--
-- Every value here is fictional. Loading this replaces all existing rows.
-- No explicit transaction: D1 supplies one and rejects BEGIN/COMMIT.

DELETE FROM audit_events;
DELETE FROM personal_access_tokens;
DELETE FROM workflow_versions;
DELETE FROM qa_pipeline_runs;
DELETE FROM runs;
DELETE FROM mission_instruction_versions;
DELETE FROM missions;
DELETE FROM mission_groups;
DELETE FROM sensor_rigs;
DELETE FROM inventory_items;
DELETE FROM lab_blackouts;
DELETE FROM documents;
DELETE FROM workflows;
DELETE FROM campaigns;
DELETE FROM robots;
DELETE FROM operators;
DELETE FROM labs;
DELETE FROM sensors;
DELETE FROM users;
DELETE FROM credit_ledger;
DELETE FROM billing_checkout_sessions;
DELETE FROM billing_accounts;
INSERT INTO billing_accounts (id, name, balance, lifetime_granted, contact_email) VALUES ('cccccccc-cccc-4ccc-8ccc-000000000001', 'CharmQuark Fleet Ops', 40, 40, 'ops@example.invalid');
INSERT INTO credit_ledger (id, account_id, delta, reason, balance_after, actor, note) VALUES ('dddddddd-dddd-4ddd-8ddd-000000000001', 'cccccccc-cccc-4ccc-8ccc-000000000001', 40, 'GRANT', 40, 'seed', 'Demo dataset opening balance');
INSERT INTO users (id, subject, name, email, role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 's.okafor', 'Sade Okafor', 's.okafor@example.invalid', 'PM');
INSERT INTO users (id, subject, name, email, role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'r.delacroix', 'Remy Delacroix', 'r.delacroix@example.invalid', 'FLEET_LEAD');
INSERT INTO users (id, subject, name, email, role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', 'm.tanaka', 'Mio Tanaka', 'm.tanaka@example.invalid', 'ROBOT_OPERATOR');
INSERT INTO labs (id, name, type, is_available, capacity, code_number) VALUES ('77777777-7777-4777-8777-000000000001', 'AV Highway Sim', 'OUTDOORS', 1, 7, 102);
INSERT INTO labs (id, name, type, is_available, capacity, code_number) VALUES ('77777777-7777-4777-8777-000000000002', 'AV Urban Track 1', 'OUTDOORS', 1, 5, 101);
INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES ('66666666-6666-4666-8666-000000000001', 'OP-01', 'Mio Tanaka', 'ROBOT_OPERATOR', 1, 1);
INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES ('66666666-6666-4666-8666-000000000002', 'OP-02', 'Ivo Bergqvist', 'ROBOT_OPERATOR', 1, 2);
INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES ('66666666-6666-4666-8666-000000000003', 'OP-03', 'Priya Raman', 'QA_REVIEWER', 1, 3);
INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES ('66666666-6666-4666-8666-000000000004', 'OP-04', 'Remy Delacroix', 'FIELD_LEAD', 1, 4);
INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES ('66666666-6666-4666-8666-000000000005', 'OP-05', 'No''a Feldman', 'DATA_ENGINEER', 1, 5);
INSERT INTO robots (id, robot_code, name, platform, serial_number, status, safety_certified, calibration_valid, commissioned, commissioned_date, is_standby) VALUES ('55555555-5555-4555-8555-000000000001', 'AV-SEDAN-01', 'Apollo', 'Autonomous Sedan', 'AV-S-001', 'ACTIVE', 1, 1, 1, '2026-06-01', 0);
INSERT INTO robots (id, robot_code, name, platform, serial_number, status, safety_certified, calibration_valid, commissioned, commissioned_date, is_standby) VALUES ('55555555-5555-4555-8555-000000000002', 'AV-SUV-01', 'Artemis', 'Autonomous SUV', 'AV-X-001', 'ACTIVE', 1, 1, 1, '2026-06-01', 0);
INSERT INTO robots (id, robot_code, name, platform, serial_number, status, safety_certified, calibration_valid, commissioned, commissioned_date, is_standby) VALUES ('55555555-5555-4555-8555-000000000003', 'AV-TRUCK-01', 'Atlas', 'Autonomous Truck', 'AV-T-001', 'ACTIVE', 1, 1, 1, '2026-06-01', 0);
INSERT INTO robots (id, robot_code, name, platform, serial_number, status, safety_certified, calibration_valid, commissioned, commissioned_date, is_standby) VALUES ('55555555-5555-4555-8555-000000000004', 'AV-TRUCK-02', 'Athena', 'Autonomous Truck', 'AV-T-002', 'POOL', 1, 1, 1, '2026-06-01', 1);
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000001', 'LIDAR-01', 'LIDAR_3D', 'OPERATIONAL');
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000002', 'LIDAR-02', 'LIDAR_3D', 'OPERATIONAL');
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000003', 'CAM-01', 'STEREO_CAMERA', 'OPERATIONAL');
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000004', 'CAM-02', 'STEREO_CAMERA', 'OPERATIONAL');
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000005', 'RADAR-01', 'RADAR', 'OPERATIONAL');
INSERT INTO sensors (id, asset_name, sensor_type, status) VALUES ('88888888-8888-4888-8888-000000000006', 'RADAR-02', 'RADAR', 'OPERATIONAL');
INSERT INTO campaigns (id, name, campaign_type, target_n, status, default_sensor_rig_id) VALUES ('11111111-1111-4111-8111-000000000001', 'Urban Perception Data Collection', 'PERCEPTION', 60, 'ACTIVE', '33333333-3333-4333-8333-000000000001');
UPDATE campaigns SET coverage_space = '{"target_per_cell":3,"dimensions":[{"key":"weather","label":"Weather","levels":["clear","rain","fog"]},{"key":"time","label":"Time of day","levels":["day","night"]},{"key":"traffic","label":"Traffic","levels":["light","heavy"]}]}' WHERE id = '11111111-1111-4111-8111-000000000001';
INSERT INTO mission_groups (id, campaign_id, name, "order") VALUES ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001', 'Navigation', 1);
INSERT INTO mission_groups (id, campaign_id, name, "order") VALUES ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001', 'Manipulation', 2);
INSERT INTO mission_groups (id, campaign_id, name, "order") VALUES ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001', 'Docking', 3);
INSERT INTO sensor_rigs (id, campaign_id, name, sensor_ids, qa_profile) VALUES ('33333333-3333-4333-8333-000000000001', '11111111-1111-4111-8111-000000000001', 'Urban Perception A', '["88888888-8888-4888-8888-000000000001","88888888-8888-4888-8888-000000000003","88888888-8888-4888-8888-000000000005"]', NULL);
INSERT INTO sensor_rigs (id, campaign_id, name, sensor_ids, qa_profile) VALUES ('33333333-3333-4333-8333-000000000002', '11111111-1111-4111-8111-000000000001', 'Highway Perception B', '["88888888-8888-4888-8888-000000000002","88888888-8888-4888-8888-000000000004","88888888-8888-4888-8888-000000000006"]', '{"name":"Manipulation Rig — 5 × 10 min","segment_count":5,"segment_target_s":600,"duration_test_max_s":180,"duration_warn_min_s":480,"size_fail_low":0.3,"size_warn_low":0.6,"size_warn_high":1.6,"suppressed_warning_keywords":["wifi","ntp drift","ft tare"],"sensors":[{"key":"lidar_top","role":"Roof LiDAR (32-beam)","extensions":[".mcap"],"expected_mb_per_min":120,"requires_state_file":true},{"key":"stereo_front","role":"Front stereo pair","extensions":[".mcap"],"expected_mb_per_min":90,"requires_state_file":true},{"key":"imu_9dof","role":"IMU 9-DOF","extensions":[".mcap"],"expected_mb_per_min":1.2,"requires_state_file":true},{"key":"ft_6axis","role":"6-axis force/torque","extensions":[".mcap"],"expected_mb_per_min":0.4,"requires_state_file":false}]}');
INSERT INTO sensor_rigs (id, campaign_id, name, sensor_ids, qa_profile) VALUES ('33333333-3333-4333-8333-000000000003', '11111111-1111-4111-8111-000000000001', 'Rural Perception C', '["88888888-8888-4888-8888-000000000001","88888888-8888-4888-8888-000000000004","88888888-8888-4888-8888-000000000005"]', NULL);
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', '11111111-1111-4111-8111-000000000001', 'Calibration target (checkerboard A3)', 'TOOL', 4, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', '11111111-1111-4111-8111-000000000001', 'AprilTag board set', 'TOOL', 6, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000003', '11111111-1111-4111-8111-000000000001', 'Pallet, euro (mock load)', 'CONSUMABLE', 12, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000004', '11111111-1111-4111-8111-000000000001', 'Tote, plastic 600x400', 'CONSUMABLE', 30, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000005', '11111111-1111-4111-8111-000000000001', 'Battery pack, spare', 'SPARE_PART', 8, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000006', '11111111-1111-4111-8111-000000000001', 'Gripper pad set', 'SPARE_PART', 2, 'set', 'ORDERED');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000007', '11111111-1111-4111-8111-000000000001', 'Wrist camera mount', 'PAYLOAD', 3, 'ea', 'AVAILABLE');
INSERT INTO inventory_items (id, campaign_id, name, kind, quantity, unit, status) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-000000000008', '11111111-1111-4111-8111-000000000001', 'RTK base station', 'PAYLOAD', 1, 'ea', 'AVAILABLE');
INSERT INTO missions (id, campaign_id, mission_group_id, mission_code, name, "group", status, review_status, duration_type, reps_target, reps_actual, schedule_status, instructions_complete, risk_level, legal_approval, variants, inventory_item_ids, instructions) VALUES ('44444444-4444-4444-8444-000000000001', '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 'URB-001', 'Unprotected Left Turn with Pedestrians', 'Navigation', 'COLLECTABLE', 'NEEDS_REVIEW', 'MEDIUM', 5, 2, 'AVAILABLE', true, 'HIGH', 'APPROVED', '[{"id":"v1","name":"Default","correct":{"id":"e0","label":"Nominal","reps":null},"errors":[{"id":"e1","label":"Path error","errorClass":"INDUCED","reps":null}]}]', '[]', '[{"step":1,"text":"Drive to intersection"},{"step":2,"text":"Wait for pedestrians"},{"step":3,"text":"Turn left safely"}]');
INSERT INTO missions (id, campaign_id, mission_group_id, mission_code, name, "group", status, review_status, duration_type, reps_target, reps_actual, schedule_status, instructions_complete, risk_level, legal_approval, variants, inventory_item_ids, instructions) VALUES ('44444444-4444-4444-8444-000000000002', '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 'URB-002', 'Heavy Rain Highway Merge', 'Navigation', 'COLLECTABLE', 'APPROVED', 'LONG', 3, 3, 'RECORDED', true, 'HIGH', 'APPROVED', '[{"id":"v1","name":"Default","correct":{"id":"e0","label":"Nominal","reps":null},"errors":[{"id":"e1","label":"Sensor noise","errorClass":"INDUCED","reps":null}]}]', '[]', '[{"step":1,"text":"Accelerate to highway speed"},{"step":2,"text":"Merge"},{"step":3,"text":"Maintain lane in rain"}]');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000001', '11111111-1111-4111-8111-000000000001', '2026-09-07', '09:00', 'DONE', 'SINGLE', '["44444444-4444-4444-8444-000000000001","44444444-4444-4444-8444-000000000002"]', '{"44444444-4444-4444-8444-000000000001":1,"44444444-4444-4444-8444-000000000002":1}', '55555555-5555-4555-8555-000000000001', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000001', '33333333-3333-4333-8333-000000000001', 1, 'S-20260907', '26W37m1L1S1', 'Urban Perception A', 'AV Highway Sim');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000002', '11111111-1111-4111-8111-000000000001', '2026-09-07', '11:00', 'VALIDATED', 'SINGLE', '["44444444-4444-4444-8444-000000000008","44444444-4444-4444-8444-000000000002"]', '{"44444444-4444-4444-8444-000000000008":1,"44444444-4444-4444-8444-000000000002":1}', '55555555-5555-4555-8555-000000000009', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000002', '33333333-3333-4333-8333-000000000001', 1, 'S-20260907', '26W37m2L2S1', 'Urban Perception A', 'AV Urban Track 1');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000003', '11111111-1111-4111-8111-000000000001', '2026-09-08', '09:00', 'MANUAL_QA', 'SINGLE', '["44444444-4444-4444-8444-000000000005"]', '{"44444444-4444-4444-8444-000000000005":1}', '55555555-5555-4555-8555-000000000005', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000002', '33333333-3333-4333-8333-000000000002', 2, 'S-20260908', '26W37m1L2S2', 'Highway Perception B', 'AV Urban Track 1');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000004', '11111111-1111-4111-8111-000000000001', '2026-09-09', '13:00', 'COLLECTED', 'SINGLE', '["44444444-4444-4444-8444-000000000003","44444444-4444-4444-8444-000000000004"]', '{"44444444-4444-4444-8444-000000000003":1,"44444444-4444-4444-8444-000000000004":1}', '55555555-5555-4555-8555-000000000002', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000001', '33333333-3333-4333-8333-000000000001', 2, 'S-20260909', '26W37m2L1S2', 'Urban Perception A', 'AV Highway Sim');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000005', '11111111-1111-4111-8111-000000000001', '2026-09-11', '09:00', 'CONFIRMED', 'SINGLE', '["44444444-4444-4444-8444-000000000006"]', '{"44444444-4444-4444-8444-000000000006":1}', '55555555-5555-4555-8555-000000000006', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000002', '33333333-3333-4333-8333-000000000002', 3, 'S-20260911', '26W37m1L2S3', 'Highway Perception B', 'AV Urban Track 1');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000006', '11111111-1111-4111-8111-000000000001', '2026-09-14', '11:00', 'READY', 'SINGLE', '["44444444-4444-4444-8444-000000000001","44444444-4444-4444-8444-000000000003"]', '{"44444444-4444-4444-8444-000000000001":1,"44444444-4444-4444-8444-000000000003":1}', '55555555-5555-4555-8555-000000000001', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000001', '33333333-3333-4333-8333-000000000001', 3, 'S-20260914', NULL, 'Urban Perception A', 'AV Highway Sim');
INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, robot_id, operator_id, lab_id, sensor_rig_id, run_seq, provisional_code, encoded_code, payload, run_lab) VALUES ('99999999-9999-4999-8999-000000000007', '11111111-1111-4111-8111-000000000001', '2026-09-15', '09:00', 'ASSEMBLING', 'SINGLE', '["44444444-4444-4444-8444-000000000009"]', '{"44444444-4444-4444-8444-000000000009":1}', '55555555-5555-4555-8555-000000000009', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000002', '33333333-3333-4333-8333-000000000001', 4, 'S-20260915', NULL, 'Urban Perception A', 'AV Urban Track 1');
INSERT INTO qa_pipeline_runs (id, run_id, level, overall_status, gates, mode, verdict, manifest, profile_name, autochecked_at) VALUES ('eeeeeeee-eeee-4eee-8eee-000000000001', '99999999-9999-4999-8999-000000000003', 'FINAL', 'FAIL', '[{"level":"FIELD","name":"Extraction output","step":1,"status":"PASS","check_items":[{"name":"Manifest source","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":null,"detail":"20 file(s) under runs/99999999-9999-4999-8999-000000000003/ (uploaded)"},{"name":"Roof LiDAR (32-beam) present","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top","detail":"lidar_top: 5 segment(s) found"},{"name":"Front stereo pair present","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front","detail":"stereo_front: 5 segment(s) found"},{"name":"IMU 9-DOF present","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof","detail":"imu_9dof: 5 segment(s) found"},{"name":"6-axis force/torque present","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis","detail":"ft_6axis: 5 segment(s) found"}]},{"level":"FIELD","name":"Gaps: segments and sidecars","step":2,"status":"FAIL","check_items":[{"name":"lidar_top/segment 0: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 0","detail":"lidar_top_00.mcap + state file"},{"name":"lidar_top/segment 1: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 1","detail":"lidar_top_01.mcap + state file"},{"name":"lidar_top/segment 2: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 2","detail":"lidar_top_02.mcap + state file"},{"name":"lidar_top/segment 3: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 3","detail":"lidar_top_03.mcap + state file"},{"name":"lidar_top/segment 4: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 4","detail":"lidar_top_04.mcap + state file"},{"name":"stereo_front/segment 0: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 0","detail":"stereo_front_00.mcap + state file"},{"name":"stereo_front/segment 1: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 1","detail":"stereo_front_01.mcap + state file"},{"name":"stereo_front/segment 2: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 2","detail":"stereo_front_02.mcap + state file"},{"name":"stereo_front/segment 3: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 3","detail":"stereo_front_03.mcap + state file"},{"name":"stereo_front/segment 4: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 4","detail":"stereo_front_04.mcap + state file"},{"name":"imu_9dof/segment 0: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 0","detail":"imu_9dof_00.mcap + state file"},{"name":"imu_9dof/segment 1: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 1","detail":"imu_9dof_01.mcap + state file"},{"name":"imu_9dof/segment 2: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 2","detail":"imu_9dof_02.mcap + state file"},{"name":"imu_9dof/segment 3: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 3","detail":"imu_9dof_03.mcap + state file"},{"name":"imu_9dof/segment 4: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 4","detail":"imu_9dof_04.mcap + state file"},{"name":"ft_6axis/segment 0: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 0","detail":"ft_6axis_00.mcap (no sidecar expected)"},{"name":"ft_6axis/segment 1: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 1","detail":"ft_6axis_01.mcap (no sidecar expected)"},{"name":"ft_6axis/segment 2: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 2","detail":"ft_6axis_02.mcap (no sidecar expected)"},{"name":"ft_6axis/segment 3: complete","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 3","detail":"ft_6axis_03.mcap (no sidecar expected)"},{"name":"ft_6axis/segment 4: no .mcap asset","result":"FAIL","machine_result":"FAIL","level":"fail","subject":"ft_6axis/segment 4","detail":"Found ft_6axis_04.csv but none of the expected type"}]},{"level":"FIELD","name":"Run completeness and durations","step":3,"status":"FAIL","check_items":[{"name":"lidar_top/segment 0: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 0","detail":"10m 00s (target ~10m 00s)"},{"name":"lidar_top/segment 1: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 1","detail":"10m 00s (target ~10m 00s)"},{"name":"lidar_top/segment 2: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 2","detail":"10m 00s (target ~10m 00s)"},{"name":"lidar_top/segment 3: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 3","detail":"10m 00s (target ~10m 00s)"},{"name":"lidar_top/segment 4: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 4","detail":"10m 00s (target ~10m 00s)"},{"name":"stereo_front/segment 0: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 0","detail":"10m 00s (target ~10m 00s)"},{"name":"stereo_front/segment 1: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 1","detail":"10m 00s (target ~10m 00s)"},{"name":"stereo_front/segment 2: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 2","detail":"10m 00s (target ~10m 00s)"},{"name":"stereo_front/segment 3: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 3","detail":"10m 00s (target ~10m 00s)"},{"name":"stereo_front/segment 4: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 4","detail":"10m 00s (target ~10m 00s)"},{"name":"imu_9dof/segment 0: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 0","detail":"10m 00s (target ~10m 00s)"},{"name":"imu_9dof/segment 1: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 1","detail":"10m 00s (target ~10m 00s)"},{"name":"imu_9dof/segment 2: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 2","detail":"10m 00s (target ~10m 00s)"},{"name":"imu_9dof/segment 3: test take","result":"FAIL","machine_result":"FAIL","level":"fail","subject":"imu_9dof/segment 3","detail":"1m 36s (target ~10m 00s) — at or under 180s this is a test take, not a take. Remove before upload."},{"name":"imu_9dof/segment 4: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 4","detail":"10m 00s (target ~10m 00s)"},{"name":"ft_6axis/segment 0: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 0","detail":"10m 00s (target ~10m 00s)"},{"name":"ft_6axis/segment 1: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 1","detail":"10m 00s (target ~10m 00s)"},{"name":"ft_6axis/segment 2: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 2","detail":"10m 00s (target ~10m 00s)"},{"name":"ft_6axis/segment 3: full length","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 3","detail":"10m 00s (target ~10m 00s)"}]},{"level":"LAB","name":"File sizes","step":4,"status":"IN_PROGRESS","check_items":[{"name":"lidar_top/segment 0: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 0","detail":"lidar_top_00.mcap — 1.14 GB vs expected ~1.17 GB (0.97x)"},{"name":"lidar_top/segment 1: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 1","detail":"lidar_top_01.mcap — 1.14 GB vs expected ~1.17 GB (0.97x)"},{"name":"lidar_top/segment 2: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 2","detail":"lidar_top_02.mcap — 1.14 GB vs expected ~1.17 GB (0.97x)"},{"name":"lidar_top/segment 3: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 3","detail":"lidar_top_03.mcap — 1.14 GB vs expected ~1.17 GB (0.97x)"},{"name":"lidar_top/segment 4: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 4","detail":"lidar_top_04.mcap — 1.14 GB vs expected ~1.17 GB (0.97x)"},{"name":"stereo_front/segment 0: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 0","detail":"stereo_front_00.mcap — 918.0 MB vs expected ~900.0 MB (1.02x)"},{"name":"stereo_front/segment 1: below expected","result":"RED_FLAG","machine_result":"RED_FLAG","level":"warn","subject":"stereo_front/segment 1","detail":"stereo_front_01.mcap — 405.0 MB vs expected ~900.0 MB (0.45x) — under 60% of expected"},{"name":"stereo_front/segment 2: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 2","detail":"stereo_front_02.mcap — 918.0 MB vs expected ~900.0 MB (1.02x)"},{"name":"stereo_front/segment 3: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 3","detail":"stereo_front_03.mcap — 918.0 MB vs expected ~900.0 MB (1.02x)"},{"name":"stereo_front/segment 4: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 4","detail":"stereo_front_04.mcap — 918.0 MB vs expected ~900.0 MB (1.02x)"},{"name":"imu_9dof/segment 0: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 0","detail":"imu_9dof_00.mcap — 11.9 MB vs expected ~12.0 MB (0.99x)"},{"name":"imu_9dof/segment 1: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 1","detail":"imu_9dof_01.mcap — 11.9 MB vs expected ~12.0 MB (0.99x)"},{"name":"imu_9dof/segment 2: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 2","detail":"imu_9dof_02.mcap — 11.9 MB vs expected ~12.0 MB (0.99x)"},{"name":"imu_9dof/segment 3: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 3","detail":"imu_9dof_03.mcap — 1.9 MB vs expected ~1.9 MB (0.99x)"},{"name":"imu_9dof/segment 4: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 4","detail":"imu_9dof_04.mcap — 11.9 MB vs expected ~12.0 MB (0.99x)"},{"name":"ft_6axis/segment 0: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 0","detail":"ft_6axis_00.mcap — 4.2 MB vs expected ~4.0 MB (1.05x)"},{"name":"ft_6axis/segment 1: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 1","detail":"ft_6axis_01.mcap — 4.2 MB vs expected ~4.0 MB (1.05x)"},{"name":"ft_6axis/segment 2: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 2","detail":"ft_6axis_02.mcap — 4.2 MB vs expected ~4.0 MB (1.05x)"},{"name":"ft_6axis/segment 3: size in range","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 3","detail":"ft_6axis_03.mcap — 4.2 MB vs expected ~4.0 MB (1.05x)"}]},{"level":"LAB","name":"File types","step":5,"status":"FAIL","check_items":[{"name":"lidar_top/segment 0: lidar_top_00.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 0","detail":"Correct type (.mcap)"},{"name":"lidar_top/segment 1: lidar_top_01.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 1","detail":"Correct type (.mcap)"},{"name":"lidar_top/segment 2: lidar_top_02.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 2","detail":"Correct type (.mcap)"},{"name":"lidar_top/segment 3: lidar_top_03.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 3","detail":"Correct type (.mcap)"},{"name":"lidar_top/segment 4: lidar_top_04.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"lidar_top/segment 4","detail":"Correct type (.mcap)"},{"name":"stereo_front/segment 0: stereo_front_00.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 0","detail":"Correct type (.mcap)"},{"name":"stereo_front/segment 1: stereo_front_01.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 1","detail":"Correct type (.mcap)"},{"name":"stereo_front/segment 2: stereo_front_02.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 2","detail":"Correct type (.mcap)"},{"name":"stereo_front/segment 3: stereo_front_03.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 3","detail":"Correct type (.mcap)"},{"name":"stereo_front/segment 4: stereo_front_04.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"stereo_front/segment 4","detail":"Correct type (.mcap)"},{"name":"imu_9dof/segment 0: imu_9dof_00.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 0","detail":"Correct type (.mcap)"},{"name":"imu_9dof/segment 1: imu_9dof_01.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 1","detail":"Correct type (.mcap)"},{"name":"imu_9dof/segment 2: imu_9dof_02.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 2","detail":"Correct type (.mcap)"},{"name":"imu_9dof/segment 3: imu_9dof_03.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 3","detail":"Correct type (.mcap)"},{"name":"imu_9dof/segment 4: imu_9dof_04.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"imu_9dof/segment 4","detail":"Correct type (.mcap)"},{"name":"ft_6axis/segment 0: ft_6axis_00.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 0","detail":"Correct type (.mcap)"},{"name":"ft_6axis/segment 1: ft_6axis_01.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 1","detail":"Correct type (.mcap)"},{"name":"ft_6axis/segment 2: ft_6axis_02.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 2","detail":"Correct type (.mcap)"},{"name":"ft_6axis/segment 3: ft_6axis_03.mcap","result":"PASS","machine_result":"PASS","level":"pass","subject":"ft_6axis/segment 3","detail":"Correct type (.mcap)"},{"name":"ft_6axis/segment 4: wrong type","result":"FAIL","machine_result":"FAIL","level":"fail","subject":"ft_6axis/segment 4","detail":"ft_6axis_04.csv is .csv, expected .mcap"}]},{"level":"FINAL","name":"Accept / reject","step":6,"status":"FAIL","check_items":[{"name":"lidar_top/segment 0: routine warnings suppressed","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":"lidar_top/segment 0","detail":"1 known-benign warning(s) for this profile"},{"name":"lidar_top/segment 1: routine warnings suppressed","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":"lidar_top/segment 1","detail":"1 known-benign warning(s) for this profile"},{"name":"lidar_top/segment 2: capture warning","result":"RED_FLAG","machine_result":"RED_FLAG","level":"warn","subject":"lidar_top/segment 2","detail":"lidar: 412 dropped packets between 03:11 and 03:18"},{"name":"lidar_top/segment 3: routine warnings suppressed","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":"lidar_top/segment 3","detail":"1 known-benign warning(s) for this profile"},{"name":"lidar_top/segment 4: routine warnings suppressed","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":"lidar_top/segment 4","detail":"1 known-benign warning(s) for this profile"},{"name":"imu_9dof/segment 3: remove before upload","result":"FAIL","machine_result":"FAIL","level":"fail","subject":"imu_9dof/segment 3","detail":"imu_9dof_03.mcap runs 1m 36s — a test take. Delete it, then re-run QA."},{"name":"ft_6axis/segment 0: routine warnings suppressed","result":"NOT_APPLICABLE","machine_result":"NOT_APPLICABLE","level":"info","subject":"ft_6axis/segment 0","detail":"1 known-benign warning(s) for this profile"}]}]', 'AUTOCHECK', 'REJECT', '{"source":"UPLOAD","root":"runs/99999999-9999-4999-8999-000000000003/","files":[{"sensor":"lidar_top","segment":0,"filename":"lidar_top_00.mcap","size_bytes":1220542464,"duration_s":600,"state_file":true,"capture_warnings":["wifi scan failed (radio busy)"]},{"sensor":"stereo_front","segment":0,"filename":"stereo_front_00.mcap","size_bytes":962592768,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"imu_9dof","segment":0,"filename":"imu_9dof_00.mcap","size_bytes":12457083,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"ft_6axis","segment":0,"filename":"ft_6axis_00.mcap","size_bytes":4404019,"duration_s":600,"state_file":false,"capture_warnings":["ft tare drift corrected at start"]},{"sensor":"lidar_top","segment":1,"filename":"lidar_top_01.mcap","size_bytes":1220542464,"duration_s":600,"state_file":true,"capture_warnings":["wifi scan failed (radio busy)"]},{"sensor":"stereo_front","segment":1,"filename":"stereo_front_01.mcap","size_bytes":424673280,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"imu_9dof","segment":1,"filename":"imu_9dof_01.mcap","size_bytes":12457083,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"ft_6axis","segment":1,"filename":"ft_6axis_01.mcap","size_bytes":4404019,"duration_s":600,"state_file":false,"capture_warnings":[]},{"sensor":"lidar_top","segment":2,"filename":"lidar_top_02.mcap","size_bytes":1220542464,"duration_s":600,"state_file":true,"capture_warnings":["lidar: 412 dropped packets between 03:11 and 03:18"]},{"sensor":"stereo_front","segment":2,"filename":"stereo_front_02.mcap","size_bytes":962592768,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"imu_9dof","segment":2,"filename":"imu_9dof_02.mcap","size_bytes":12457083,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"ft_6axis","segment":2,"filename":"ft_6axis_02.mcap","size_bytes":4404019,"duration_s":600,"state_file":false,"capture_warnings":[]},{"sensor":"lidar_top","segment":3,"filename":"lidar_top_03.mcap","size_bytes":1220542464,"duration_s":600,"state_file":true,"capture_warnings":["wifi scan failed (radio busy)"]},{"sensor":"stereo_front","segment":3,"filename":"stereo_front_03.mcap","size_bytes":962592768,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"imu_9dof","segment":3,"filename":"imu_9dof_03.mcap","size_bytes":1993133,"duration_s":96,"state_file":true,"capture_warnings":[]},{"sensor":"ft_6axis","segment":3,"filename":"ft_6axis_03.mcap","size_bytes":4404019,"duration_s":600,"state_file":false,"capture_warnings":[]},{"sensor":"lidar_top","segment":4,"filename":"lidar_top_04.mcap","size_bytes":1220542464,"duration_s":600,"state_file":true,"capture_warnings":["wifi scan failed (radio busy)"]},{"sensor":"stereo_front","segment":4,"filename":"stereo_front_04.mcap","size_bytes":962592768,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"imu_9dof","segment":4,"filename":"imu_9dof_04.mcap","size_bytes":12457083,"duration_s":600,"state_file":true,"capture_warnings":[]},{"sensor":"ft_6axis","segment":4,"filename":"ft_6axis_04.csv","size_bytes":4404019,"duration_s":600,"state_file":false,"capture_warnings":[]}]}', 'Manipulation Rig — 5 × 10 min', '2026-09-08 14:20:00');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=clear|payload=light|surface=day', 5, '44444444-4444-4444-8444-000000000001');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=clear|payload=heavy|surface=day', 4, '44444444-4444-4444-8444-000000000002');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=clear|payload=light|surface=night', 3, '44444444-4444-4444-8444-000000000003');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=clear|payload=heavy|surface=night', 2, '44444444-4444-4444-8444-000000000004');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000005', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=rain|payload=light|surface=day', 3, '44444444-4444-4444-8444-000000000005');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000006', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=rain|payload=heavy|surface=day', 3, '44444444-4444-4444-8444-000000000006');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000007', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=rain|payload=light|surface=night', 2, '44444444-4444-4444-8444-000000000007');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000008', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=rain|payload=heavy|surface=night', 1, '44444444-4444-4444-8444-000000000008');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000009', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=fog|payload=light|surface=day', 1, '44444444-4444-4444-8444-000000000009');
INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id) VALUES ('cccccccc-0000-4000-8000-000000000010', '11111111-1111-4111-8111-000000000001', '99999999-9999-4999-8999-000000000001', 'lighting=fog|payload=light|surface=night', 1, '44444444-4444-4444-8444-000000000010');
UPDATE runs SET coverage_cell = '{"weather":"clear","time":"day","traffic":"light"}' WHERE id = '99999999-9999-4999-8999-000000000001';
INSERT INTO workflows (id, name, xml) VALUES ('w1_task_ready', 'Get a mission schedulable', '<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:cq="https://charmquark.app/schema/bpmn/cq/1.0" id="Definitions_1" targetNamespace="https://charmquark.app/workflows">
  <bpmn:process id="Process_1" name="Get a mission schedulable" isExecutable="false">
    <bpmn:startEvent id="picked" name="Mission picked">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="instructions" name="Complete operator instructions" cq:service="complete_instructions">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="risk" name="Assess risk" cq:service="assess_risk">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="risk_level" name="Risk?">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="legal" name="Legal review" cq:service="legal_review">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="approved" name="Approved?">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="ready" name="Mission READY">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="rejected" name="Not approved">
      <bpmn:incoming>Flow_8</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="picked" targetRef="instructions" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="instructions" targetRef="risk" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="risk" targetRef="risk_level" />
    <bpmn:sequenceFlow id="Flow_4" name="Low" sourceRef="risk_level" targetRef="ready" />
    <bpmn:sequenceFlow id="Flow_5" name="Potential or high" sourceRef="risk_level" targetRef="legal" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="legal" targetRef="approved" />
    <bpmn:sequenceFlow id="Flow_7" name="Yes" sourceRef="approved" targetRef="ready" />
    <bpmn:sequenceFlow id="Flow_8" name="No" sourceRef="approved" targetRef="rejected" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="picked_di" bpmnElement="picked">
        <dc:Bounds x="102" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="instructions_di" bpmnElement="instructions">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="risk_di" bpmnElement="risk">
        <dc:Bounds x="410" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="risk_level_di" bpmnElement="risk_level" isMarkerVisible="true">
        <dc:Bounds x="605" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="legal_di" bpmnElement="legal">
        <dc:Bounds x="750" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="approved_di" bpmnElement="approved" isMarkerVisible="true">
        <dc:Bounds x="945" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ready_di" bpmnElement="ready">
        <dc:Bounds x="1122" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="rejected_di" bpmnElement="rejected">
        <dc:Bounds x="1122" y="232" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="138" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="410" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="120" />
        <di:waypoint x="605" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="655" y="120" />
        <di:waypoint x="1122" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="655" y="120" />
        <di:waypoint x="750" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="850" y="120" />
        <di:waypoint x="945" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="995" y="120" />
        <di:waypoint x="1122" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8">
        <di:waypoint x="970" y="145" />
        <di:waypoint x="970" y="250" />
        <di:waypoint x="1122" y="250" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
');
INSERT INTO workflows (id, name, xml) VALUES ('w2_compose_confirm_session', 'Compose & confirm a run', '<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:cq="https://charmquark.app/schema/bpmn/cq/1.0" id="Definitions_1" targetNamespace="https://charmquark.app/workflows">
  <bpmn:process id="Process_1" name="Compose &amp; confirm a run" isExecutable="false">
    <bpmn:startEvent id="start" name="Missions to schedule">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="draft" name="Draft a packed run" cq:service="propose_runs">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:userTask id="assign" name="Assign robot, operator, lab and rig" cq:service="assign_run_members">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="readiness" name="Check readiness" cq:service="check_readiness">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="is_ready" name="Ready?">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:serviceTask id="confirm" name="Confirm run" cq:service="confirm_run">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="confirmed" name="Run confirmed">
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="start" targetRef="draft" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="draft" targetRef="assign" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="assign" targetRef="readiness" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="readiness" targetRef="is_ready" />
    <bpmn:sequenceFlow id="Flow_5" name="Yes" sourceRef="is_ready" targetRef="confirm" />
    <bpmn:sequenceFlow id="Flow_6" name="No" sourceRef="is_ready" targetRef="assign" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="confirm" targetRef="confirmed" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="start_di" bpmnElement="start">
        <dc:Bounds x="102" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="draft_di" bpmnElement="draft">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="assign_di" bpmnElement="assign">
        <dc:Bounds x="410" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="readiness_di" bpmnElement="readiness">
        <dc:Bounds x="580" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="is_ready_di" bpmnElement="is_ready" isMarkerVisible="true">
        <dc:Bounds x="775" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="confirm_di" bpmnElement="confirm">
        <dc:Bounds x="920" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="confirmed_di" bpmnElement="confirmed">
        <dc:Bounds x="1122" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="138" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="410" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="120" />
        <di:waypoint x="580" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="680" y="120" />
        <di:waypoint x="775" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="825" y="120" />
        <di:waypoint x="920" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="800" y="145" />
        <di:waypoint x="800" y="190" />
        <di:waypoint x="460" y="190" />
        <di:waypoint x="460" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="1020" y="120" />
        <di:waypoint x="1122" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
');
INSERT INTO workflows (id, name, xml) VALUES ('w3_data_pipeline', 'Run the data pipeline', '<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:cq="https://charmquark.app/schema/bpmn/cq/1.0" id="Definitions_1" targetNamespace="https://charmquark.app/workflows">
  <bpmn:process id="Process_1" name="Run the data pipeline" isExecutable="false">
    <bpmn:startEvent id="confirmed" name="Run confirmed">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="capture" name="Advance to capture" cq:service="advance_run">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="qa" name="QA autocheck" cq:service="run_qa_autocheck">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="qa_result" name="QA passed?">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="manual_qa" name="Manual QA review" cq:service="human_approval">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="export" name="Export to Roboflow" cq:service="roboflow_export">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="finish" name="Mark done" cq:service="advance_run">
      <bpmn:incoming>Flow_7</bpmn:incoming>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="done" name="Done">
      <bpmn:incoming>Flow_8</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="confirmed" targetRef="capture" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="capture" targetRef="qa" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="qa" targetRef="qa_result" />
    <bpmn:sequenceFlow id="Flow_4" name="Pass" sourceRef="qa_result" targetRef="export" />
    <bpmn:sequenceFlow id="Flow_5" name="Needs review" sourceRef="qa_result" targetRef="manual_qa" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="manual_qa" targetRef="export" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="export" targetRef="finish" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="finish" targetRef="done" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="confirmed_di" bpmnElement="confirmed">
        <dc:Bounds x="102" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="capture_di" bpmnElement="capture">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="qa_di" bpmnElement="qa">
        <dc:Bounds x="410" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="qa_result_di" bpmnElement="qa_result" isMarkerVisible="true">
        <dc:Bounds x="605" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="manual_qa_di" bpmnElement="manual_qa">
        <dc:Bounds x="750" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="export_di" bpmnElement="export">
        <dc:Bounds x="920" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="finish_di" bpmnElement="finish">
        <dc:Bounds x="1090" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="done_di" bpmnElement="done">
        <dc:Bounds x="1292" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="138" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="410" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="120" />
        <di:waypoint x="605" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="655" y="120" />
        <di:waypoint x="920" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="655" y="120" />
        <di:waypoint x="750" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="850" y="120" />
        <di:waypoint x="920" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="1020" y="120" />
        <di:waypoint x="1090" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8">
        <di:waypoint x="1190" y="120" />
        <di:waypoint x="1292" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
');
INSERT INTO workflows (id, name, xml) VALUES ('w4_blocker_reassign', 'Handle a blocker', '<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:cq="https://charmquark.app/schema/bpmn/cq/1.0" id="Definitions_1" targetNamespace="https://charmquark.app/workflows">
  <bpmn:process id="Process_1" name="Handle a blocker" isExecutable="false">
    <bpmn:startEvent id="blocked" name="Run blocked">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="issues" name="List readiness issues" cq:service="check_readiness">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:userTask id="swap" name="Swap offending member" cq:service="assign_run_members">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:serviceTask id="recheck" name="Re-check readiness" cq:service="check_readiness">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:exclusiveGateway id="clear" name="Clear?">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:serviceTask id="reconfirm" name="Re-confirm run" cq:service="confirm_run">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="resolved" name="Blocker resolved">
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="blocked" targetRef="issues" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="issues" targetRef="swap" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="swap" targetRef="recheck" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="recheck" targetRef="clear" />
    <bpmn:sequenceFlow id="Flow_5" name="Yes" sourceRef="clear" targetRef="reconfirm" />
    <bpmn:sequenceFlow id="Flow_6" name="No" sourceRef="clear" targetRef="swap" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="reconfirm" targetRef="resolved" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="blocked_di" bpmnElement="blocked">
        <dc:Bounds x="102" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="issues_di" bpmnElement="issues">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="swap_di" bpmnElement="swap">
        <dc:Bounds x="410" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="recheck_di" bpmnElement="recheck">
        <dc:Bounds x="580" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="clear_di" bpmnElement="clear" isMarkerVisible="true">
        <dc:Bounds x="775" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="reconfirm_di" bpmnElement="reconfirm">
        <dc:Bounds x="920" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="resolved_di" bpmnElement="resolved">
        <dc:Bounds x="1122" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="138" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="410" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="120" />
        <di:waypoint x="580" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="680" y="120" />
        <di:waypoint x="775" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="825" y="120" />
        <di:waypoint x="920" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="800" y="145" />
        <di:waypoint x="800" y="190" />
        <di:waypoint x="460" y="190" />
        <di:waypoint x="460" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="1020" y="120" />
        <di:waypoint x="1122" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
');
