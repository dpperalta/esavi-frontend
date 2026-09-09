# Formulario de Clasificación inicial
## Sección 1: Datos de la persona notificadora
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Nombres | firstName | notifier | - |
| 2 | Apellidos| lastName | notifier | - |
| 3 | Profesión | professionItemId | notifier | - |
| 4 |  Servicio/sala de notificación del caso | room | notifier | - |
| 5 | Dirección completa del establecimiento de salud de notificación | address | notifier | - |
| 6 | Teléfono de contacto | phoneNumber | notifier | - |
| 7 | Correo electrónico | email | notifier | - |
| 8 | Fecha de la primera consulta | firstConsultationDate | classification | - |

## Sección 2: Clasificación del evento según la gravedad
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿El evento que va a reportar es un evento grave? (según la clasificación de la OPS/OMS) | isSeriousEvent | classification | - |
| 2 | Causó la muerte | causedDeath | classification | YES en isSeriousEvent |
| 3 | Genera discapacidad significativa o persistente | causedDisability | classification | YES en isSeriousEvent |
| 4 | Corresponde a una anomalía congénita | causedCongenitalAnomaly | classification | YES en isSeriousEvent|
| 5 | Causó muerte fetal | causedFetalDeath | classification | YES en isSeriousEvent |
| 6 | Ocasiona amenaza inminente a la vida | causedLifeThreatening | classification | YES en isSeriousEvent |
| 7 | Lleva a hospitalización o a prolongación de la misma | causedHospitalization | classification | YES en isSeriousEvent |
| 8 | Causó un aborto | causedAbortion | classification | YES en isSeriousEvent |
| 9 | Otro evento importante | causedOtherCondition | classification | YES en isSeriousEvent |
| 10 | Explique cuál es el evento importante | otherSeriousConditionDescription | classification | YES en  causedOtherCondition |

# Formulario de notificación grave

## Sección 1: Antecedentes de la persona vacunada
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿El paciente presenta antecedentes médicos relevantes? | hasRelevantMedicalHistory | notification | - |
| 2 | ¿Tiene antecedentes de eventos previos similares al actual? | hasPreviousEventHistory | severeNotification | - |
| 3 | ¿Tiene antecedentes de reacciones alérgicas a otras vacunas? | hasAllergyToOtherVaccines | severeNotification | - |
| 4 | ¿Tiene antecedentes de reacciones alérgica a medicamentos? | hasAllergyToMedications | severeNotification | - |
| 5 | ¿Tiene antecedentes de reacciones alérgicas a dosis previas de la misma vacuna? | hasAllergyToPreviousSameVaccine | severeNotification | - |
| 6 | ¿El paciente estaba tomando algún medicamento cuando se vacunó? | takesMedication | notification | - |

## Sección 2: Antecedentes médicos (condición: YES en cualquiera del 1 al 5) 
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Antecedente médico | diagnosticTermId | notificationMedicalHistory | - |

## Sección 3: Antecedentes farmacológicos
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Medicamento | medicationName | notificationMedication | YES en takesMedication |
| 2 | Forma farmacéutica | pharmaceuticalFormItemId | notificationMedication | YES en takesMedication |
| 3 | Dosis | dose | notificationMedication | YES en takesMedication |
| 4 | Vía de administración | administrationRouteItemId | notificationMedication | YES en takesMedication |
| 5 | Fecha de inicio | startDate | notificationMedication | YES en takesMedication |
| 6 | Otro (no consta en la lista) | isOtherMedication | notificationMedication  | YES en takesMedication |
| 7 | Describa el medicamento | otherMedicationText | notificationMedication | true isOtherMedication |

## Sección 4: Datos de embarazo (condición: Sexo Femenino - Edad entre 15 y 49 años)
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Estaba embarazada al momento del ESAVI? | wasPregnantAtEsavi | notificationPregnancy | Sexo Femenino - Edad entre 15 y 49 años |
| 2 | ¿Estaba embarazada al momento de la vacunación? | wasPregnantAtVaccination | notificationPregnancy | YES en wasPregnantAtEsavi |
| 3 | Fecha de la última menstruación | lastMenstruationDate | notificationPregnancy |  YES en wasPregnantAtEsavi |
| 4 | Registre la fecha probable de parto o fecha de nacimiento | probableDeliveryDate | notificationPregnancy |  YES en wasPregnantAtEsavi |
| 5 | ¿Hubo alguna complicación durante el embarazo, el parto o el puerperio, o complicaciones neonatales o anomalías congénitas? | hasComplications | notificationPregnancy |  YES en wasPregnantAtEsavi |

## Sección 5A: Complicaciones del embarazo
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Tipo de complicación | complicationTypeItemId |  notificationPregnancyComplication | YES en hasComplications |
| 2 | Complicación | diagnosticTermId | notificationPregnancyComplication | YES en hasComplications |

## Sección 5B: Descripción de las complicaciones del embarazo
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Describa complicaciones (Haga un resumen cronológico de la historia clínica relacionada con la complicación del embarazo actual) | pregnancyComplicationsDescription | severeNotification | YES en hasComplications |

## Sección 6: Selección de vacunas
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Vacuna sospechosa | isSuspected | notificationVaccine | - |
| 2 | Nombre de la vacuna | vaccineName | notificationVaccine | - |
| 3 | Fecha de vacunación | vaccinationDate | notificationVaccine | - |
| 4 | Hora de vacunación | vaccinationTime | notificationVaccine | - |
| 5 | Dosis de la vacuna | doseNumber | notificationVaccine | - |
| 6 | Lote/número de lote | batchNumber | notificationVaccine | - |
| 7 | Fecha de expiración | expirationDate | notificationVaccine | - |
|---|-------------------|----------|----------| ----------|
| 8 | Nombre del diluyente | diluentCatalogId | notificationDiluent | - |
| 9 | Lote/número de lote | batchNumber | notificationDiluent | - |
| 10 | Fecha de expiración | expirationDate | notificationDiluent | - |
| 11 | Fecha de reconstitución | reconstitutionDate | notificationDiluent | - |
| 12 | Hora de reconstitución | reconstitutionTime | notificationDiluent | - |

## Sección 7: Eventos adversos
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Evento Adverso | esaviName | notificationEvent | - |
| 2 | Principal | isMainEsavi | notificationEvent | - |
| 3 | Fecha de inicio | startDate | notificationEvent | - |
| 4 | Hora de inicio | startTime | notificationEvent | - |

## Sección 8: Descripción del ESAVI
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Descripción del ESAVI (signos y síntomas) | esaviDescription | notification | - |

## Sección 9: Desenlace
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Desenlace | outcomeItemId | notification | - |
| 2 | Si la persona murió, indique la fecha de la muerte | deathDate | notification | SI outcomeItemId == DEATH  |
| 3 | ¿Se solicitó una autopsia? | autopsyRequested | notification | SI outcomeItemId == DEATH | 
| 4 | ¿Fue hecha una autopsia verbal? | verbalAutopsyPerformed | notification | SI outcomeItemId == DEATH |
| 5 | Investigación requerida | requestInvestigation | notification | - |

# Formulario de Notificación No Grave

## Sección 1: Antecedentes de la persona vacunada

| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿El paciente presenta antecedentes médicos relevantes? | hasRelevantMedicalHistory | notification | - |
| 2 | ¿El paciente estaba tomando algún medicamento cuando se vacunó? | takesMedication | notification | - |

## Sección 2: Antecedentes médicos (condición: YES en cualquiera del 1 al 5) 
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Antecedente médico | diagnosticTermId | notificationMedicalHistory | - |

## Sección 3: Antecedentes farmacológicos
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Medicamento | medicationName | notificationMedication | YES en takesMedication |
| 2 | Forma farmacéutica | pharmaceuticalFormItemId | notificationMedication | YES en takesMedication |
| 3 | Dosis | dose | notificationMedication | YES en takesMedication |
| 4 | Vía de administración | administrationRouteItemId | notificationMedication | YES en takesMedication |
| 5 | Fecha de inicio | startDate | notificationMedication | YES en takesMedication |
| 6 | Otro (no consta en la lista) | isOtherMedication | notificationMedication  | YES en takesMedication |
| 7 | Describa el medicamento | otherMedicationText | notificationMedication | true isOtherMedication |

## Sección 4: Datos de embarazo (condición: Sexo Femenino - Edad entre 15 y 49 años)
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Estaba embarazada al momento del ESAVI? | wasPregnantAtEsavi | notificationPregnancy | Sexo Femenino - Edad entre 15 y 49 años |
| 2 | ¿Estaba embarazada al momento de la vacunación? | wasPregnantAtVaccination | notificationPregnancy | YES en wasPregnantAtEsavi |
| 3 | Fecha de la última menstruación | lastMenstruationDate | notificationPregnancy |  YES en wasPregnantAtEsavi |
| 4 | Registre la fecha probable de parto o fecha de nacimiento | probableDeliveryDate | notificationPregnancy |  YES en wasPregnantAtEsavi |
| 5 | ¿Hubo alguna complicación durante el embarazo, el parto o el puerperio, o complicaciones neonatales o anomalías congénitas? | hasComplications | notificationPregnancy |  YES en wasPregnantAtEsavi |

## Sección 5: Antecedentes de vacunación o inmunización
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Sitio de vacunación | vaccinationSiteItemId | nonSevereNotification | - |
| 2 | Dirección del centro de vacunación | vaccinationCenterAddress | nonSevereNotification | - |
| 3 | Localidad | vaccinationGeoLocationId | nonSevereNotification | - |
| 4 | Establecimiento de vacunación | vaccinationHealthFacilityId | nonSevereNotification | - |

## Sección 6: ¿Cómo se verificó la información de la vacunación?
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Registro/certificado físico | verifiedPhysicalDocument | nonSevereNotification | - |
| 2 | Registro/certificado electrónico | verifiedElectronicRecord | nonSevereNotification | - |
| 3 | Declaración verbal del paciente | verifiedVerbalReport | nonSevereNotification | - |
| 4 | Historias clínicas corroboradas con certificado | verifiedClinicalRecord | nonSevereNotification | - |
| 5 | No se sabe | verifiedUnknown | nonSevereNotification | - |
| 6 | Otro | verifiedOtherSource | nonSevereNotification | - |
| 7 | ¿Cuál? | otherSourceDescription | nonSevereNotification | true en verifiedOtherSource |

## Sección 7:  Selección de vacunas
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Vacuna sospechosa | isSuspected | notificationVaccine | - |
| 2 | Nombre de la vacuna | vaccineName | notificationVaccine | - |
| 3 | Fecha de vacunación | vaccinationDate | notificationVaccine | - |
| 4 | Hora de vacunación | vaccinationTime | notificationVaccine | - |
| 5 | Dosis de la vacuna | doseNumber | notificationVaccine | - |
| 6 | Lote/número de lote | batchNumber | notificationVaccine | - |
| 7 | Fecha de expiración | expirationDate | notificationVaccine | - |

## Sección 8: Eventos adversos
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Evento Adverso | esaviName | notificationEvent | - |
| 2 | Principal | isMainEsavi | notificationEvent | - |
| 3 | Fecha de inicio | startDate | notificationEvent | - |
| 4 | Hora de inicio | startTime | notificationEvent | - |

## Sección 9: Descripción del ESAVI
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Descripción del ESAVI (signos y síntomas) | esaviDescription | notification | - |

## Sección 10: Desenlace
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Desenlace | outcomeItemId | notification | - |
| 2 | Si la persona murió, indique la fecha de la muerte | deathDate | notification | SI outcomeItemId == DEATH  | *
| 3 | ¿Se solicitó una autopsia? | autopsyRequested | notification | SI outcomeItemId == DEATH | *
| 4 | ¿Fue hecha una autopsia verbal? | verbalAutopsyPerformed | notification | SI outcomeItemId == DEATH | *
| 5 | Investigación requerida | requestInvestigation | notification | - |

* Deberían ocultar la opción DEATH (una muerte es un ESAVI Grave, no un No Grave, debería impedir guardar si outcome es DEATH)

# Formulario de Investigación 
Texto informativo: Esta fica es complementaria de la ficha de notificación y se debe completar (llenar) considerando los datos de la primera. Solo se debe rellenar en casos en los que el nivel técnico subnacional haya decidido llevar a cabo una investigación completa, por tratarse de un evento grave o de un evento no grave que cumpla algunas de las siguientes condiciones:
Se han identificado conglomerados de casos (gropos de dos o más casos), ya sea en el tiempo o en el espacio.
La frecuencia del evento se considera superior a lo esperado.
Es un evento nuevo o no descrito antes, o es un evento conocido con características clínicas o epidemiológicas nuevas o no esperadas (en términos de grupos poblacionales, zonas geográficas, etc.)
Algunos datos indican que el evento fue ocasionado por un error programático o por una desviación de la calidad de la vacuna, su diluyente (si aplica) o el dispositivo empleado para su administración.
Esta ficha sirve de guía para identificar toda la información que se considere relevante para el análisis de causalidad del evento. Dicho análisis debe ser realizado por un comité de expertos en ESAVI a nivel subnacional o nacional y se deben identificar los factores que contribuyeron a su aparición a fin de poder establecer medidas de mitigación de reisgo.
Subtítulo: Información de investigación

## Sección 1: Fuentes de información 
Texto informativo: Indique las fuentes de información consultadas para recopilar la información de la siguiente investigación (marque todas las que correspondan)
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Historia clínica | history | investigationSource | - |
| 2 | Entrevista al vacunado | interviewVaccinatedPerson | investigationSource | - |
| 3 | Entrevista al personal de salud | interviewHealthWorker | investigationSource | - |
| 4 | Registros de vacunación | vaccinationRecord | investigationSource | - |
| 5 | Informe de autopsia | autopsyRecord | investigationSource | - |
| 6 | Informe de autopsia verbal | verbalAutopsyRecord | investigationSource | - |
| 7 | Informe de investigación comunitaria | investigationReport | investigationSource | - |
| 8 | Otro | other | investigationSource | - |
| 9 | Especifique ¿cuál? | otherDescription | investigationSource | true en other |

## Sección A1: Información básica
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Lugar de vacunación | vaccinationSiteItemId | investigation | - |
| 2 | Dirección completa del lugar de vacunación | vaccinationLatitude & vaccinationLongitude | investigation | Debe tener mapa |
| 3 | Nivel geográfico subnacional | vaccinationGeoLocationId | investigation | - |
| 4 | Fecha de hospitalización | hospitalizationDate | investigation | - |
| 5 | Fecha de inicio de la investigación | investigationStartDate | investigation | - |
| 6 | Estado de la persona al momento de la investigación | statusItemId | investigation | - |
| 6.1 | Si la persona murió, indique la fecha de la muerte | deathDate | investigationAutopsy | DEATH en statusItemId (isDeath se convierte en true) |
| 6.2 | Hora de la muerte | deathTime | investigationAutopsy | DEATH en statusItemId |
| 6.3 | Se realizó autopsia | isAutopsyPerformed | investigationAutopsy | DEATH en statusItemId (true isDeath) |
| 6.4 | Fecha de la autopsia | autopsyDate | investigationAutopsy | true en isAutopsyPerformed |
| 6.5 | Registre los resultados de la necropsia | autopsyComments | investigationAutopsy | true en isAutopsyPerformed |
| 6.6 | Se ha programado una fecha prevista de la autopsia | isAutopsyScheduled | investigationAutopsy | false en isAutopsyPerformed |
| 6.7 | Fecha prevista de la autopsia | scheduledAutopsyDate | investigationAutopsy | true en isAutopsyScheduled |

# Sección A2: Datos del equipo de investigación
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Nombres y apellidos | fullName | investigationTeamMember | - |
| 2 | Institución y cargo | institutionName | investigationTeamMember | - |
| 3 | Correo electrónico | email | investigationTeamMember | - |
| 4 | Teléfono | phone | investigationTeamMember | - |

## Sección B: Información pertinente sobre la persona vacunada antes de la inmunización
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Antecedentes de hospitalización en los 30 días previos a la vacunación actual | hasPriorHospitalizationHistory | investigationMedicalHistory | - |
| 2 | Observaciones del antecedente de hospitalización | priorHospitalizationObservations | investigationMedicalHistory | YES en hasPriorHospitalizationHistory |
| 3 | Antecedentes familiares de otra enfermedad (relevantes para un ESAVI) o alergia | hasFamilyHistory | investigationMedicalHistory | - | 
| 4 | Observaciones de antecedentes familiares | familyHistoryObservations | investigationMedicalHistory | YES en hasFamilyHistory |

## Sección B1: Preguntas para mujeres
Texto informativo: Principalmente entre 12 y 49 años, o cuando exista sospecha de embarazo
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Confirme si la mujer estaba embarazada en el momento de la vacuna | isPregnancyConfirmed | investigationMedicalHistory | Sexo == Femenino, edad entre 12 y 50 años |
| 2 | Semanas de gestación | gestationalWeeks | investigationMedicalHistory | YES en isPregnancyConfirmed |
| 3 | ¿Cuál método usó para el cálculo de la edad gestacional | gestationMethodItemId | investigationMedicalHistory | YES en isPregnancyConfirmed |
| 4 | ¿Se identificó algún factor de riesgo de complicaciones obstétricas graves | hasPregnancyRiskFactor | investigationMedicalHistory | YES en isPregnancyConfirmed | 
| 5 | Explique cuál fue el factor de riesgo | riskFactorDescription | investigationMedicalHistory | YES en hasPregnancyRiskFactor | 
| 6 | El parto fue: | birthItemId | investigationMedicalHistory | YES en isPregnancyConfirmed |
| 7 | El nacimiento fue: | deliveryItemId | investigationMedicalHistory | YES en isPregnancyConfirmed |
| 8 | Peso al nacer (en gramos) | birthWeightGrams | investigationMedicalHistory | YES en isPregnancyConfirmed |
| 9 | ¿Cuál fue el desenlace del embarazo? | pregnancyOutcomeItemId | investigationMedicalHistory | YES en isPregnancyConfirmed |

## Sección B2: Afecciones médicas del recién nacido
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Describa la afección médica del recién nacido | diagnosticTermId | investigationPregnancyCondition | pregnancyOutcomeItemId == "Nacido vivo con afección médica al nacer" |

## Sección C: Detalles de la primera evaluación clínica del ESAVI
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Ha recibido la persona atención médica para el ESAVI? | receivedMedicalAttention | investigationClinicalEvaluation | - |
| - | Fuente de información (marque todas las opciones que sea neceasrio) | - | - | - |
| 2 | Examen realizado por el investigador | sourceExam | investigationClinicalEvaluation | - |
| 3 | Documentos | sourceDocuments | investigationClinicalEvaluation | - |
| 4 | Autopsia verbal | sourceVerbalAutopsy | investigationClinicalEvaluation | - |
| 5 | Otro | sourceOther | investigationClinicalEvaluation | - |
| 6 | ¿Cuál? | otherDescription | investigationClinicalEvaluation | YES en sourceOther |
| 7 | ¿La institución en la que fue atendido por primera vez es diferente a la institución en donde recibió el tratamiento definitivo? | evaluationInstitutionTypeItemId | evaluationInstitution | - |
| 7.1 | Nombre de la persona que realizó la atención | personName | evaluationInstitution | DIFFERENT en evaluationInstitutionTypeItemId |
| 7.2 | Nombre de la institución de atención inicial | healthFacilityId (y su copia en institutionName) | evaluationInstitution | DIFFERENT en evaluationInstitutionTypeItemId |
| 7.3 | Contacto de la persona que realizó la atención inicial | personContact | evaluationInstitution | DIFFERENT en evaluationInstitutionTypeItemId |
| 8 | Nombre e información de contacto de la persona o personas que conocen los detalles clínicos | clinicalDetailsPersonName | investigationClinicalEvaluation | - |
| 9 | Si el ESAVI se presentó en un menor de cinco años de edad, ¿hay sospecha de maltrato infantil? | suspectedChildAbuse | investigationClinicalEvaluation | - |
| 10 | Explique | childAbuseExplanation | investigationClinicalEvaluation | true en suspectedChildAbuse |
| 11 | Si el ESAVI se presentó en una persona adolescente o adulta, ¿hay evidencia de violencia intrafamiliar? | suspectedDomesticViolence | investigationClinicalEvaluation | - |
| 12 | Explique | domesticViolenceExplanation | investigationClinicalEvaluation | true en suspectedDomesticViolence |
| 13 | Otros antecedentes sociales relevantes del caso | otherSocialBackground | investigationClinicalEvaluation | - |
| 14 | Signos y síntomas en orden cronológico desde el momento de la vacunación | signsAndSymptoms | investigationClinicalEvaluation | - |
| 15 | Nombre e información de contacto de la persona o familiares de la persona, con los detalles clínicos | familyClinicalDetails | investigationClinicalEvaluation | - |
| 16 | Haga un resumen completo de los datos clínicos y paraclínicos del caso, resaltando lo más relevante para el análisis del evento. Por favor, escanee las pruebas físicas del caso y guárdelas organizadamente en su archivo digital | completeClinicalSummary | investigationClinicalEvaluation | - |
| 17 | Diagnóstico final o presuntivo | diagnosticTermId | investigationDiagnostic | Pueden ser N diagnósticos |

## Sección D: Información relacionada con ESAVI sobre las personas vacunadas en el sitio de vacunación
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Nombre de la vacuna | vaccineWhodrugId | investigationVaccineAdministered | Pueden ser N vacunas |
| 2 | Número de dosis administradas | doseNumber | investigationVaccineAdministered | Pueden ser N vacunas |
| 3 | Número de personas vacunadas con el vial de la vacuna involucrada | vaccinatedPerVialCount | investigationVaccinationContext | - |
| 4 | Especifique las localizaciones | locations | investigationVaccinationContext | - |
| 5 | ¿Cuándo fue vacunada la persona que tuvo el o los ESAVI? | momentItemId | investigationVaccinationContext | - |
| 6 | ¿En el caso de viales multidosis, se administró la vacuna? | multidoseItemId | investigationVaccinationContext | - |

## Sección D1: Conglomerados
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Es este caso parte de un conglomerado? | isCluster | investigationVaccinationContext | - |
| 2 | Número de identificación del conglomerado de casos | clusterIdentificationNumber | investigationVaccinationContext | YES en isCluster | 
| 3 | Si la respuesta es positiva, ¿cuántos casos adicionales se han detectado en el conglomerado? | clusterAdditionalCaseCount | investigationVaccinationContext | YES en isCluster |
| 4 | ¿Recibieron todos los casos del mismo conglomerado la vacuna del mismo vial? | clusterUsedSameVial | investigationVaccinationContext | YES en isCluster |
| 5 | Si no, enumere los viales usados por el conglomerado de casos | clusterSameVialCount | investigationVaccinationContext | NO en clusterUsedSameVial |

## Sección E1: Cadena de frío y transporte (Cadena de frío)
Texto informativo: Último sitio de almacenamiento 
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Se encuentra monitorizada la temperatura del último refrigerador de almacenamiento con un registro diario a.m. y p.m. de la temperatura? | storageTemperatureMonitored | investigationColdChain | - |
| 2 | Si marcó "sí", ¿hubo alguna desviación del rango 2°C - 8°C después de que la vacuna se introdujera en el refrigerador? | storageRangeDeviation | investigationColdChain | true en storageTemperatureMonitored |
| 3 | ¿Se siguió el procedimiento correcto para almacenar las vacunas, los diluyente y las jeringas? | storageProcedureFollowed | investigationColdChain | - |
| 4 | ¿Había algún otro objeto diferente de las vacunas, del PNI y de los diluyentes en la nevera o el refrigerador? | storageOtherObjectPresent | investigationColdChain | - |
| 5 | ¿Había alguna vacuna parcialmente reconstituida en el refrigerador? | storagePartiallyReconstitutedVaccine | investigationColdChain | - |
| 6 | ¿Había alguna vacuna que no pudiese usarse (vencida, sin etiqueta o congelada) en el refrigerador | storageVaccineNotUsable | investigationColdChain | - |
| 7 | ¿Había en el almacén algún diluyente que no pudiese usarse (vencido, sin ser recomendado por el fabricante, roto o sucio)? | storageDiluentNotUsable | investigationColdChain | - |
| 8 | Especifique los hallazgos clave, observaciones adicionales o comentario | storageKeyFindings | investigationColdChain | - |

## Sección E2: Cadena de frío y transporte (Transporte de la vacuna)
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Tipo de termo o de caja fría usados | transportTypeThermo | investigationColdChain | - |
| 2 | ¿Se envió el termo o la caja fría el mismo día de la vacunación? | transportSetInThermos | investigationColdChain | - |
| 3 | ¿Regresó el termo o la caja fría el mismo día de la vacunación? | transportReturnedInThermos | investigationColdChain | - |
| 4 | Se usó un paquete frío acondicionado? | transportUsedColdPack | investigationColdChain | - |
| 5 | Especifique los hallazgos clave o las observaciones adicionales o los comentarios | transportKeyFindings | investigationColdChain | - |

## Sección F: Prácticas de inmunización en los lugares donde se usó la vacuna en cuestión (a través de entrevistas u observaciones de prácticas en el sitio de vacunación)
Texto informativo: Jeringas y agujas
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Se usaron jeringas autodesactivables (AD)? | usedAutoDisableSyringes | investigationAdministrationError | - |
| 1.1 | Vidrio | usedGlassSyringes | investigationAdministrationError | NO en usedAutoDisableSyringes |
| 1.2 | Desechables | usedDisposableSyringes | investigationAdministrationError | NO en usedAutoDisableSyringes |
| 1.3 | Desechables recicladas | usedRecycledDisposableSyringes | investigationAdministrationError | NO en usedAutoDisableSyringes |
| 1.4 | Otras | usedOtherSyringes | investigationAdministrationError | NO en usedAutoDisableSyringes |
| 1.5 | ¿Cuáles? | otherSyringesDescription | investigationAdministrationError | true en usedOtherSyringes |
| 2 | Especifique los hallazgos clave, observaciones adicionales o comentarios | syringesKeyFindings | investigationAdministrationError | - |

## Sección F2: Prácticas de inmunización en los lugares donde se usó la vacuna en cuestión (a través de entrevistas u observaciones de prácticas en el sitio de vacunación)
Texto informativo: Procedimiento de reconstitución
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | ¿Se usó la misma jeringa para la reconstitución de múltiples viales de la misma vacuna? | reconstitutionUsedSameSyringe | investigationAdministrationError | - |
| 2 | ¿Se usó la misma jeringa para la reconstitución de diferentes vacunas? | reconstitutionUsedSameSyringeDifferentVaccine | investigationAdministrationError | - |
| 3 | ¿Se usó una jeringa distinta para la reconstitución de cada vial de la vacuna? | reconstitutionUsedDifferentSyringeSameVial | investigationAdministrationError | - |
| 4 | ¿Se usó una jeringa distinta para la reconstitución en cada vacunación? | reconstitutionUsedDifferentSyringeDifferentVaccine | investigationAdministrationError | - |
| 5 | ¿Los diluyentes y las vacunas usadas ¿son las mismas recomendadas por el fabricante? | reconstitutionFollowedManufacturerRecommendation | investigationAdministrationError | - |
| 6 | Especifique los hallazgos clave o las observaciones adicionales o los comentarios | reconstitutionKeyFindings | investigationAdministrationError | - |
| 7 | Hubo algún error en la prescripción o no adherencia a las recomendaciones de uso de la vacuna? (indicaciones, contraindicaciones, precauciones) | hadPrescriptionError | investigationAdministrationError | - |
| 8 | Explicación y observaciones | prescriptionErrorNotes | investigationAdministrationError | - |
| 9 | ¿Considera que la vacuna administrada pudo haber estado contaminada? | hadContaminatedVaccine | investigationAdministrationError | - |
| 10 | Explicación y observaciones | contaminatedVaccineNotes | investigationAdministrationError | - |
| 11 | ¿Considera que las condiciones físicas de la vacuna (color, turbidez, sustancias extrañas, etc.) eran anormales en el momento de la administración? | hadAbnormalVaccineConditions | investigationAdministrationError | - |
| 12 | Explicación y observaciones | abnormalConditionsNotes | investigationAdministrationError | - |
| 13 | ¿Considera que hubo un error en la preparación o reconstitución (producto, vacuna o diluyente equivocado, mezcla, jeringa o llenado inapropiado de la jeringa, etc.) de la vacuna por el vacunador? | hadPreparationError | investigationAdministrationError | - |
| 14 | Explicación y observaciones | preparationErrorNotes | investigationAdministrationError | - |
| 15 | ¿Considera que hubo un error en la manipulación de la vacuna (interrupción de la cadena de frio durante el transporte, el almacenamiento o la jornada de vacunación, etc.)? | hadHandlingError | investigationAdministrationError | - |
| 16 | Explicación y observaciones | handlingErrorNotes | investigationAdministrationError | - |
| 17 | ¿Considera que la vacuna se administró incorrectamente (dosis equivocada, sitio o ruta de administración, aguja del tamaño equivocado, no seguimiento a buenas prácticas de inyección, etc.)? | hadImproperAdministration | investigationAdministrationError | - |
| 18 | Explicación y observaciones | improperAdministrationNotes | investigationAdministrationError | - |

## Sección G: Investigación comunitaria
Texto informativo: Investigación comunitaria(por favor, visite la localidad y entreviste a los familiares o vecinos de la persona afectada).
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1.1 | Localidad del paciente: Latitud | patientLatitude | investigationCommunity | - | 
| 1.2 | Localidad del paciente: Longitud | patientLongitude | investigationCommunity | - |
| 2 | ¿Se notificó algún evento similar en un momento próximo al momento en el que ocurrió el ESAVI y en la misma localidad? | hadSimilarEvent | investigationCommunity | - |
| 2 .1 | Si la respuesta es "sí", descríbalo | similarEventDescription | investigationCommunity | YES en hadSimilarEvent |
| 2 .2 | Si la respuesta es "sí", ¿cuántos eventos o episodios se notificaron? | similarEventCount | investigationCommunity | YES en hadSimilarEvent |
| 2 .3 | De las personas afectadas, ¿cuántas están vacunadas? | affectedVaccinated | investigationCommunity | YES en hadSimilarEvent |
| 2 .4 | De las personas afectadas, ¿cuántas están sin vacunar? | affectedUnvaccinated | investigationCommunity | YES en hadSimilarEvent |
| 2 .5 | De las personas afectadas, ¿cuántas tienen estado desconocido? | affectedUnknown | investigationCommunity | YES en hadSimilarEvent |
| 3 | Otros comentarios | otherComments | investigationCommunity | - |

## Sección H: Otras constataciones, observaciones y comentarios
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Otras constataciones, observaciones y comentarios | notes | investigation | - |

# Formulario de Clasificación Final
## Sección 1: Orden A: Importancia
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Importancia A | importanceAItemId | finalClassification | - |

## Sección 1A: Importancia A: Con asociación causal congruente con la vacuna
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | A1. Evento relacionado con la vacuna o cualquiera de sus componentes | aIsRelatedToVaccineProduct | finalClassification | - |
| 2 | A2. Evento relacionado con una desviación de calidad del producto biológico o la vacuna | aIsRelatedToQualityDeviation | finalClassification | - |

## Sección 1B: A. Con asociación causal congruente con el proceso de vacunación
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | A3. Evento relacionado con un error programático | aIsRelatedToProgrammaticError | finalClassification | - |
| 2 | A4. Evento por estrés que tuvo lugar inmediatamente antes, durante o inmediatamente después del proceso de vacunación | aIsRelatedToStress | finalClassification | - |  

## Sección 2: Orden B: Importancia
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Importancia B | importanceBItemId | finalClassification | - |

## Sección 2A: Indeterminado
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | B1. La relación temporal es congruente, pero no hay evidencia definitiva suficiente sobre una relación causal con la vacuna (puede ser un evento recientemente asociado a la vacuna) | bIsConsistentTemporalRelation | finalClassification | - |
| 2 | B2. Factores determinantes para la clasificación muestran tendencias conflictivas a favor y en contra de una asociación causal con la vacunación | bHasDeterminantFactor | finalClassification | - |

## Sección 3: Orden C: Importancia
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Importancia C | importanceCItemId | finalClassification | - |

## Sección 3A: Sin asociación causal congruente con la vacuna o el proceso de vacunación
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | C. Una enfermedad subyacente o emergente o una afección causada por exposición a algo distinto que la vacuna o el proceso de vacunación | cHasCoincidentCause | finalClassification | - |

## Sección 4: Orden D: No clasificable
| # | Texto en pantalla | variable | Tabla | Condition |
|---|-------------------|----------|----------| ----------|
| 1 | Especificar la información adicional requerida para clasificar el caso en situaciones en las que se identifiquen eventos falsos y se haya iniciado el análisis de causalidad, estos se incluirán en esta categoría | dIsUnclassifiable | finalClassification | - |