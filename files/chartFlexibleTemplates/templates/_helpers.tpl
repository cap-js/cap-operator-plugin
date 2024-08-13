{{- define "capApplicationVersionName" -}}
{{ printf "cav-%s-%d" (include "appName" $) (.Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $xsuaa := index .Values.serviceInstances "xsuaa" -}}
{{ printf "%s" $xsuaa.parameters.xsappname }}
{{- end -}}

{{- define "hasServiceOfferingName" -}}
{{- $found := "false" -}}
{{- $offeringName := .offeringName -}}
{{- $si := .si -}}
{{- range $sik, $siv := $si}}
    {{- if (eq (get $siv "serviceOfferingName") $offeringName) -}}
        {{- $found = "true" -}}
    {{- end -}}
{{- end -}}
{{- $found -}}
{{- end -}}

{{- define "domainPatterns" -}}
    {{- if .Values.app.domains.secondary -}}
        {{- $doms := list .Values.app.domains.primary -}}
        {{- range .Values.app.domains.secondary -}}
            {{- $doms = append $doms . -}}
        {{- end -}}
        {{- if gt (len $doms) 1 -}}
            {{- join "|" $doms | printf "(%s)" -}}
        {{- else -}}
            {{- first $doms -}}
        {{- end -}}
    {{- else -}}
        {{- printf "%s" .Values.app.domains.primary -}}
    {{- end -}}
{{- end -}}
