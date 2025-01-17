import {
    ReflectionKind,
    DeclarationReflection,
    DeclarationHierarchy,
} from "../../models/reflections/index";
import { Type, ReferenceType } from "../../models/types";
import { Component, ConverterComponent } from "../components";
import { Converter } from "../converter";
import type { Context } from "../context";

/**
 * A handler that converts all instances of {@link LateResolvingType} to their renderable equivalents.
 */
@Component({ name: "type" })
export class TypePlugin extends ConverterComponent {
    reflections = new Set<DeclarationReflection>();

    /**
     * Create a new TypeHandler instance.
     */
    override initialize() {
        this.listenTo(this.owner, {
            [Converter.EVENT_RESOLVE]: this.onResolve,
            [Converter.EVENT_RESOLVE_END]: this.onResolveEnd,
            [Converter.EVENT_END]: () => this.reflections.clear(),
        });
    }

    /**
     * Triggered when the converter resolves a reflection.
     *
     * @param context  The context object describing the current state the converter is in.
     * @param reflection  The reflection that is currently resolved.
     */
    private onResolve(context: Context, reflection: DeclarationReflection) {
        if (reflection.kindOf(ReflectionKind.ClassOrInterface)) {
            this.postpone(reflection);

            walk(reflection.implementedTypes, (target) => {
                this.postpone(target);
                if (!target.implementedBy) {
                    target.implementedBy = [];
                }
                target.implementedBy.push(
                    ReferenceType.createResolvedReference(
                        reflection.name,
                        reflection,
                        context.project
                    )
                );
            });

            walk(reflection.extendedTypes, (target) => {
                this.postpone(target);
                if (!target.extendedBy) {
                    target.extendedBy = [];
                }
                target.extendedBy.push(
                    ReferenceType.createResolvedReference(
                        reflection.name,
                        reflection,
                        context.project
                    )
                );
            });
        }

        function walk(
            types: Type[] | undefined,
            callback: { (declaration: DeclarationReflection): void }
        ) {
            if (!types) {
                return;
            }
            types.forEach((type) => {
                if (!(type instanceof ReferenceType)) {
                    return;
                }
                if (
                    !type.reflection ||
                    !(type.reflection instanceof DeclarationReflection)
                ) {
                    return;
                }
                callback(type.reflection);
            });
        }
    }

    private postpone(reflection: DeclarationReflection) {
        this.reflections.add(reflection);
    }

    /**
     * Triggered when the converter has finished resolving a project.
     */
    private onResolveEnd(context: Context) {
        this.reflections.forEach((reflection) => {
            if (reflection.implementedBy) {
                reflection.implementedBy.sort((a, b) => {
                    if (a.name === b.name) {
                        return 0;
                    }
                    return a.name > b.name ? 1 : -1;
                });
            }

            let root!: DeclarationHierarchy;
            let hierarchy!: DeclarationHierarchy;
            function push(types: Type[]) {
                const level: DeclarationHierarchy = { types: types };
                if (hierarchy) {
                    hierarchy.next = level;
                    hierarchy = level;
                } else {
                    root = hierarchy = level;
                }
            }

            if (reflection.extendedTypes) {
                push(reflection.extendedTypes);
            }

            push([
                ReferenceType.createResolvedReference(
                    reflection.name,
                    reflection,
                    context.project
                ),
            ]);
            hierarchy.isTarget = true;

            if (reflection.extendedBy) {
                push(reflection.extendedBy);
            }

            reflection.typeHierarchy = root;
        });
    }
}
