CREATE UNIQUE INDEX "alert_rules_project_id_event_type_key"
ON "alert_rules"("project_id", "event_type");
