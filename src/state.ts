/**
 * @title state v5 finite state machine library
 * @author http://www.steelbreeze.net/state.cs
 * @copyright (c) 2014-5 Steelbreeze Limited
 * @license MIT and GPL v3 licences
 */

/**
 * Default namespace for the state.js classes.
 * @module fsm
 */
module fsm {
    /**
     * Type signature for guard conditions used by Transitions.
     * @interface Guard
     * @param {any} message The message injected into the state machine for evaluation.
     * @param {IContext}context The object representing a particualr state machine instance.
     * @returns {boolean}
     */
    export interface Guard {
        (message: any, context: IContext): boolean;
    }

    /**
     * Type signature for an action performed durin Transitions.
     * @interface Action
     * @param {any} message The message injected into the state machine for evaluation.
     * @param {IContext} context The object representing a particualr state machine instance.
     * @param  {boolean} history For internal use only; indicates that history semantics are in operation when the action is called.
     * @returns {any} Note that the any return type is used to indicate that the state machine runtime does not care what the return type of actions are.
     */
    export interface Action {
        (message: any, context: IContext, history: boolean): any;
    }

    /**
     * Type signature for a set of actions performed during Transitions.
     * @interface Behavior
     */
    export interface Behavior extends Array<Action> {
    }

    export interface Selector {
        (transitions: Array<Transition>, message: any, context: IContext): Transition;
    }

    /**
     * Interface for the state machine context; an object used as each instance of a state machine (as the classes in this library describe a state machine model).
     * @interface IContext
     */
    export interface IContext {
        /**
         * @member {boolean} isTerminated Indicates that the state machine instance has reached a terminate pseudo state and therfore will no longer evaluate messages.
         */
        isTerminated: boolean;
        
        /**
         * Updates the last known state for a given region.
         * @method setCurrent
         * @param {Region} region The region to update the last known state for.
         * @param {State} state The last known state for the given region.
         */
        setCurrent(region: Region, state: State): void;
        
        /**
         * Returns the last known state for a given region.
         * @method getCurrent
         * @param {Region} region The region to update the last known state for.
         * @returns {State} The last known state for the given region.
         */
        getCurrent(region: Region): State;
    }

    /**
     * An abstract class used as the base for the Region and Vertex classess.
     * An element is any part of the tree structure that represents a composite state machine model.
     * @class Element
     */
    export class Element {
        /**
         * The symbol used to seperate element names within a fully qualified name.
         * Change this static member to create different styles of qualified name generated by the toString method.
         * @member {string}
         */
        public static namespaceSeperator = ".";

        leave: Behavior = [];
        beginEnter: Behavior= [];
        endEnter: Behavior =[];
        enter: Behavior = [];

        constructor(public name: string) {         
        }
        
        parent(): Element {
            return;
        }
        
        root(): StateMachine {
            return this.parent().root();
        }
        
        ancestors(): Array<Element> {
            return (this.parent() ? this.parent().ancestors() : []).concat(this);
        }

        reset(): void {
            this.leave = [];
            this.beginEnter = [];
            this.endEnter = [];
            this.enter = [];
        }

        bootstrap(deepHistoryAbove: boolean): void {
            // Put these lines back for debugging
            //this.leave.push((message: any, context: IContext) => { console.log(context + " leave " + this); });
            //this.beginEnter.push((message: any, context: IContext) => { console.log(context + " enter " + this); });

            this.enter = this.beginEnter.concat(this.endEnter);
        }

        bootstrapEnter(add: (additional: Behavior) => void, next: Element) {
            add(this.beginEnter);
        }

        /**
         * Returns a the element name as a fully qualified namespace.
         * @method toString
         * @returns {string}
         */
         toString(): string {
            return this.ancestors().map<string>((e)=> { return e.name; }).join(Element.namespaceSeperator); // NOTE: while this may look costly, only used at runtime rarely if ever
        }
    }

    /**
     * An element within a state machine model that is a container of Vertices.
     * 
     * Regions are implicitly inserted into composite state machines as a containner for vertices.
     * They only need to be explicitly defined if orthognal states are required.
     * 
     * Region extends the Element class and inherits its public interface.
     * @class Region
     * @augments Element
     */
    export class Region extends Element {
        /**
         * The name given to regions thare are created automatically when a state is passed as a vertex's parent.
         * Regions are automatically inserted into state machine models as the composite structure is built; they are named using this static member.
         * Update this static member to use a different name for default regions.
         * @member {string} 
         */
        public static defaultName: string = "default";
        
        vertices: Array<Vertex> = [];
        initial: PseudoState;

        /**
         * Creates a new instance of the Region class.
         * @param {string} name The name of the region.
         * @param {State} state The parent state that this region will be a child of.
         */
        constructor(name: string, public state: State) {
            super(name);
            
            state.regions.push(this);
            
            state.root().clean = false;
        }
        
        parent(): Element {
            return this.state;
        }
        
        /**
         * Tests a region to determine if it is deemed to be complete.
         * A region is complete if its current state is final (a state having on outbound transitions).
         * @method isComplete
         * @param {IContext} context The object representing a particualr state machine instance.
         * @returns {boolean} True if the region is deemed to be complete.
         */
        isComplete(context: IContext): boolean {
            return context.getCurrent(this).isFinal();
        }

        bootstrap(deepHistoryAbove: boolean): void {
            for( var i:number = 0, l:number = this.vertices.length; i < l; i++) {
                this.vertices[i].reset();
                this.vertices[i].bootstrap(deepHistoryAbove || (this.initial && this.initial.kind === PseudoStateKind.DeepHistory));
            }

            this.leave.push((message: any, context: IContext, history: boolean) => { var current = context.getCurrent(this); if (current.leave) { invoke(current.leave, message, context, history); } });

            if (deepHistoryAbove || !this.initial || this.initial.isHistory()) {
                this.endEnter.push((message: any, context: IContext, history: boolean) => { var ini:Vertex = this.initial; if (history || this.initial.isHistory()) {ini = context.getCurrent(this) || this.initial;} invoke(ini.enter, message, context, history || (this.initial.kind === PseudoStateKind.DeepHistory)); });
            } else {
                this.endEnter = this.endEnter.concat(this.initial.enter);
            }

            super.bootstrap(deepHistoryAbove);
        }

        bootstrapTransitions(): void {
            for( var i:number = 0, l:number = this.vertices.length; i < l; i++) {
                this.vertices[i].bootstrapTransitions();
            }
        }
        
        evaluate(message: any, context: IContext): boolean {
            return context.getCurrent(this).evaluate(message, context);
        }
    }
    
    /**
     * An abstract element within a state machine model that can be the source or target of a transition (states and psuedo states).
     * 
     * Vertex extends the Element class and inherits its public interface.
     * @class Vertex
     * @augments Element
     */
    export class Vertex extends Element {
        region: Region;

        transitions: Array<Transition> = [];
        selector: Selector;      

        constructor(name: string, region: Region, selector: Selector);
        constructor(name: string, state: State, selector: Selector);
        constructor(name: string, element: any, selector: Selector) {
            super(name);

            this.selector = selector;
            
            if (element instanceof Region) {                
                this.region = <Region>element;
            } else if (element instanceof State) {
                this.region = (<State>element).defaultRegion();
            }
            
            if (this.region) {
                this.region.vertices.push(this);
                this.region.root().clean = false;
            }            
        }
        
        parent(): Element {
            return this.region;
        }
        
        /**
         * Tests the vertex to determine if it is deemed to be complete.
         * Pseudo states and simple states are always deemed to be complete.
         * Composite states are deemed to be complete when all its child regions all are complete.
         * @method isComplete
         * @param {IContext} context The object representing a particualr state machine instance.
         * @returns {boolean} True if the vertex is deemed to be complete.
         */
        isComplete(context: IContext): boolean {
            return true;
        }

        /**
         * Creates a new transtion from this vertex.
         * Newly created transitions are completion transtions; they will be evaluated after a vertex has been entered if it is deemed to be complete.
         * Transtiions can be converted to be event trigered by adding a guard condition via the transitions `where` method.
         * @method to
         * @param {Vertex} target The destination of the transition; omit for internal transitions.
         * @returns {Transition} The new transition object.
         */
        to(target?: Vertex): Transition {
            var transition = new Transition(this, target);

            this.transitions.push(transition);
            this.root().clean = false;

            return transition;
        }

        bootstrap(deepHistoryAbove: boolean): void {
            super.bootstrap(deepHistoryAbove);

            this.endEnter.push((message: any, context: IContext, history: boolean) => { this.evaluateCompletions(message, context, history); });
            this.enter = this.beginEnter.concat(this.endEnter);
        }

        bootstrapTransitions(): void {
            for(var i:number = 0, l:number = this.transitions.length; i < l; i++) {
                this.transitions[i].bootstrap();
            }
        }

        evaluateCompletions(message: any, context: IContext, history: boolean) {
            if (this.isComplete(context)) {
                this.evaluate(this, context);
            }
        }

        evaluate(message: any, context: IContext): boolean {
            var transition: Transition = this.selector(this.transitions, message, context);
            
            if (!transition) {
                return false;
            }
            
            invoke(transition.traverse, message, context, false);
                
            return true;
        }
    }

    /**
     * An enumeration of static constants that dictates the precise behaviour of pseudo states.
     *
     * Use these constants as the `kind` parameter when creating new `PseudoState` instances.
     * @class PseudoStateKind
     */
    export enum PseudoStateKind {
        Choice,
        
        /**
         * Used for psuedo states that are always the staring point when entering their parent region.
         * @member {number} Initial
         */
        Initial,
        
        Junction,
        
        /**
         * Used for psuedo states that are the the starting point when entering their parent region for the first time; subsiquent entries will start at the last known state.
         * @member {number} ShallowHistory
         */
        ShallowHistory,
        
        /**
         * As per `ShallowHistory` but the history semantic cascades through all child regions irrespective of their initial pseudo state kind.
         * @member {number} DeepHistory
         */
        DeepHistory,
        
        Terminate
    }

    /**
     * An element within a state machine model that represents an transitory Vertex within the state machine model.
     * 
     * Pseudo states are required in all state machine models; at the very least, an `Initial` pseudo state is the default stating state when the parent region is entered.
     * Other types of pseudo state are available; typically for defining history semantics or to facilitate more complex transitions.
     * A `Terminate` pseudo state kind is also available to immediately terminate processing within the entire state machine instance.
     *
     * PseudoState extends the Vertex class and inherits its public interface.
     * @class PseudoState
     * @augments Vertex
     */
    export class PseudoState extends Vertex {
        /**
         * @member {PseudoStateKind} kind The specific kind of the pesudo state that drives its behaviour.
         */
        kind: PseudoStateKind;
        
        /**
         * Creates a new instance of the PseudoState class.
         * @param {string} name The name of the pseudo state.
         * @param {Region} region The parent region that this pseudo state will be a child of.
         * @param {PseudoStateKind} kind Determines the behaviour of the PseudoState.
         */
        constructor(name: string, region: Region, kind: PseudoStateKind);
        
        /**
         * Creates a new instance of the PseudoState class.
         * @param {string} name The name of the pseudo state.
         * @param {State} state The parent state that this pseudo state will be a child of.
         * @param {PseudoStateKind} kind Determines the behaviour of the PseudoState.
         */
        constructor(name: string, state: State, kind: PseudoStateKind);

        /**
         * Creates a new instance of the PseudoState class.
         * @param {string} name The name of the pseudo state.
         * @param {Element} state The parent element that this pseudo state will be a child of.
         * @param {PseudoStateKind} kind Determines the behaviour of the PseudoState.
         */
        constructor(name: string, element: any, kind: PseudoStateKind) {
            super(name, element, pseudoState(kind));
            
            this.kind = kind;

            if (this.isInitial()) {
                this.region.initial = this;
            }
        }

        isHistory(): boolean {
            return this.kind === PseudoStateKind.DeepHistory || this.kind === PseudoStateKind.ShallowHistory;
        }

        isInitial(): boolean {
            return this.kind === PseudoStateKind.Initial || this.isHistory();
        }

        bootstrap(deepHistoryAbove: boolean): void {
            super.bootstrap(deepHistoryAbove);

            if (this.kind === PseudoStateKind.Terminate) {
                this.enter.push((message: any, context: IContext, history: boolean) => { context.isTerminated = true; });
            }
        }
    }

    /**
     * An element within a state machine model that represents an invariant condition within the life of the state machine instance.
     *
     * States are one of the fundamental building blocks of the state machine model.
     * Behaviour can be defined for both state entry and state exit.
     *
     * State extends the Vertex class and inherits its public interface.
     * @class State
     * @augments Vertex
     */
    export class State extends Vertex {
        private static selector(transitions: Array<Transition>, message: any, context: IContext): Transition {
            var result: Transition;
                
            for (var i:number = 0, l:number = transitions.length; i < l; i++) {
                if(transitions[i].guard(message, context)) {
                    if(result) {
                        throw "Multiple outbound transitions evaluated true";
                    }

                    result = transitions[i];
                }
            }
        
            return result;
        }
        
        regions: Array<Region> = [];        
        private exitBehavior: Behavior = [];
        private entryBehavior: Behavior = [];

        /** 
         * Creates a new instance of the State class.
         * @param {string} name The name of the state.
         * @param {Region} region The parent region that owns the state.
         */
        constructor(name: string, region: Region);
        
        /** 
         * Creates a new instance of the State class.
         * @param {string} name The name of the state.
         * @param {State} state The parent state that owns the state.
         */
        constructor(name: string, state: State);

        /** 
         * Creates a new instance of the State class.
         * @param {string} name The name of the state.
         * @param {Element} element The parent state that owns the state.
         */
        constructor(name: string, element: any) {
            super(name, element, State.selector);
        }

        defaultRegion(): Region {
            var region: Region;            
            
            for (var i = 0, l = this.regions.length; i < l; i++) {
                if (this.regions[i].name === Region.defaultName) {
                    region = this.regions[i];
                }
            }
            
            if (!region) {
                region = new Region(Region.defaultName, this);
            }
            
            return region;
        }
        
        /**
         * Tests the state to see if it is a final state;
         * a final state is one that has no outbound transitions.
         * @method isFinal
         * @returns {boolean} True if the state is a final state.
         */
        isFinal(): boolean {
            return this.transitions.length === 0;
        }
        
        /**
         * Tests the state to see if it is a simple state;
         * a simple state is one that has no child regions.
         * @method isSimple
         * @returns {boolean} True if the state is a simple state.
         */
        isSimple(): boolean {
            return this.regions.length === 0;
        }

        /**
         * Tests the state to see if it is a composite state;
         * a composite state is one that has one or more child regions.
         * @method isComposite
         * @returns {boolean} True if the state is a composite state.
         */
        isComposite(): boolean {
            return this.regions.length > 0;
        }

        /**
         * Tests the state to see if it is an orthogonal state;
         * an orthogonal state is one that has two or more child regions.
         * @method isOrthogonal
         * @returns {boolean} True if the state is an orthogonal state.
         */
        isOrthogonal(): boolean {
            return this.regions.length > 1;
        }

        /**
         * Adds behaviour to a state that is executed each time the state is exited.
         * @method exit
         * @param {Action} exitAction The action to add to the state's exit behaviour.
         * @returns {State} Returns the state to allow a fluent style API.
         */
        exit<TMessage>(exitAction: Action): State {
            this.exitBehavior.push(exitAction);

            this.root().clean = false;

            return this;
        }

        /**
         * Adds behaviour to a state that is executed each time the state is entered.
         * @method entry
         * @param {Action} entryAction The action to add to the state's entry behaviour.
         * @returns {State} Returns the state to allow a fluent style API.
         */
        entry<TMessage>(entryAction: Action): State {
            this.entryBehavior.push(entryAction);

            this.root().clean = false;

            return this;
        }

        bootstrap(deepHistoryAbove: boolean): void {
            for( var i:number = 0, l:number = this.regions.length; i < l; i++) {
                var region: Region = this.regions[i]; // regadless of TypeScript, still need this in this instance
                region.reset();
                region.bootstrap(deepHistoryAbove);

                this.leave.push((message: any, context: IContext, history: boolean) => { invoke(region.leave, message, context, history); });

                this.endEnter = this.endEnter.concat(region.enter);
            }

            super.bootstrap(deepHistoryAbove);

            this.leave = this.leave.concat(this.exitBehavior);
            this.beginEnter = this.beginEnter.concat(this.entryBehavior);

            this.beginEnter.push((message: any, context: IContext, history: boolean) => { if (this.region) { context.setCurrent(this.region, this); } });

            this.enter = this.beginEnter.concat(this.endEnter);
        }

        bootstrapTransitions(): void {
            for( var i:number = 0, l:number = this.regions.length; i < l; i++) {
                this.regions[i].bootstrapTransitions();
            }

            super.bootstrapTransitions();
        }

        bootstrapEnter(add: (additional: Behavior) => void, next: Element) {
            super.bootstrapEnter(add, next);

            for( var i:number = 0, l:number = this.regions.length; i < l; i++) {
                if (this.regions[i] !== next) {
                    add(this.regions[i].enter);
                }
            }
        }
        
        evaluate(message: any, context: IContext): boolean {
            var processed: boolean = false;
            
            for( var i:number = 0, l:number = this.regions.length; i < l; i++) {                
                if(this.regions[i].evaluate(message, context)) {
                    processed = true;
                }
            }
            
            if(processed === false) {
                processed = super.evaluate(message, context);
            }
            
            if(processed === true && message !== this) {
                this.evaluateCompletions(this, context, false);
            }
            
            return processed;
        }
    }

    /**
     * An element within a state machine model that represents completion of the life of the containing Region within the state machine instance.
     *
     * A final state cannot have outbound transitions.
     *
     * FinalState extends the State class and inherits its public interface.
     * @class FinalState
     * @augments State
     */
    export class FinalState extends State {
        /** 
         * Creates a new instance of the FinalState class.
         * @param {string} name The name of the final state.
         * @param {Region} region The parent region that owns the final state.
         */
        constructor(name: string, region: Region);
        
        /** 
         * Creates a new instance of the FinalState class.
         * @param {string} name The name of the final state.
         * @param {State} state The parent state that owns the final state.
         */
        constructor(name: string, state: State);
        
        /** 
         * Creates a new instance of the FinalState class.
         * @param {string} name The name of the final state.
         * @param {Element} element The parent element that owns the final state.
         */
        constructor(name: string, element: any) {
            super(name, element);
        }
        
        to(target?: Vertex): Transition {
            // ensure FinalStates will satisfy the isFinal check
            throw "A FinalState cannot be the source of a transition.";
        }
    }

    /**
     * An element within a state machine model that represents the root of the state machine model.
     *
     * StateMachine extends the State class and inherits its public interface.
     * @class StateMachine
     * @augments State
     */
    export class StateMachine extends State {
        clean: boolean = true;

        /** 
         * Creates a new instance of the StateMachine class.
         * @param {string} name The name of the state machine.
         */
        constructor(name: string) {
            super(name, undefined);
        }

        root(): StateMachine {
            return this;
        }

        /**
         * Bootstraps the state machine model; precompiles the actions to take during transition traversal.
         *
         * Bootstrapping a state machine model pre-calculates all the actions required for each transition within the state machine model.
         * The actions will exit all states as appropriate, perform transition behaviour, enter all states as appropriate and update the current state.
         *
         * This is only required if you are dynamically changing the state machine model and want to manually control when the model is bootstrapped.
         * @method bootstrap
         */
        bootstrap(deepHistoryAbove: boolean): void {
            super.reset();
            this.clean = true;

            super.bootstrap(deepHistoryAbove);
            super.bootstrapTransitions();
        }

        /**
         * Initialises an instance of the state machine and enters its initial pseudo state.
         * Entering the initial pseudo state may cause a chain of other completion transitions.
         * @method initialise
         * @param {IContext} context The object representing a particualr state machine instance.
         * @param {boolean} autoBootstrap Set to false to manually control when bootstrapping occurs.
         */
        initialise(context: IContext, autoBootstrap: boolean = true): void {
            if (autoBootstrap && this.clean === false) {
                this.bootstrap(false);
            }

            invoke(this.enter, undefined, context, false);
        }

        /**
         * Passes a message to a state machine instance for evaluation.
         * 
         * The message will cause the guard conditions of outbound transitions from the current state to be evaluated; if a single guard evaluates true, it will trigger transition traversal.
         * Transiion traversal may cause a chain of transitions to be traversed.
         * @method evaluate
         * @param {any} message A message to pass to a state machine instance for evaluation that may cause a state transition.
         * @param {IContext} context The object representing a particualr state machine instance.
         * @param {boolean} autoBootstrap Set to false to manually control when bootstrapping occurs.
         * @returns {boolean} True if the method caused a state transition.
         */
        evaluate(message: any, context: IContext, autoBootstrap: boolean = true): boolean {
            if (autoBootstrap && this.clean === false) {
                this.bootstrap(false);
            }

            if (context.isTerminated) {
                return false;
            }
            
            return super.evaluate(message, context);
        }
    }

    /**
     * A transition between vertices (states or pseudo states) that may be traversed in response to a message.
     *
     * Transitions come in a variedy of types:
     * internal transitions respond to messages but do not cause a state transition, they only have behaviour;
     * local transitions are contained within a single region therefore the source vetex is exited, the transition traversed, and the target state entered;
     * external transitions are more complex in nature as they cross region boundaries, all elements up to but not not including the common ancestor are exited and entered.
     *
     * Entering a composite state will cause the entry of the child regions within the composite state; this in turn may trigger more transitions.
     * @class Transition
     */
    export class Transition {        
        static isElse: Guard = (message: any, context: IContext): boolean => { return false; };
        
        public guard: Guard;                
        private transitionBehavior: Behavior = [];
        traverse: Behavior = [];

        /** 
         * Creates a new instance of the Transition class.
         * @param {Vertex} source The source of the transition.
         * @param {Vertex} source The target of the transition.
         */

        constructor(private source: Vertex, private target?: Vertex) {
            this.completion(); // default the transition to a completion transition
        }

        /**
         * Turns a transtion into a completion transition.
         * @method completion
         * @returns {Transition} Returns the transition object to enable the fluent API.
         */
        completion(): Transition {
            this.guard = (message: any, context: IContext): boolean => { return message === this.source; };

            return this;
        }

        /**
         * Turns a transition into an else transition.
         *
         * Else tranitions can be used at `Junction` or `Choice` pseudo states if no other transition guards evaluate true, an Else transition if present will be traversed.
         * @method else
         * @returns {Transition} Returns the transition object to enable the fluent API.
         */
        else(): Transition {
            this.guard = Transition.isElse;
            
            return this;
        }

        /**
         * Defines the guard condition for the transition.
         * @method when
         * @param {Guard} guard The guard condition that must evaluate true for the transition to be traversed. 
         * @returns {Transition} Returns the transition object to enable the fluent API.
         */
        when(guard: Guard): Transition {
            this.guard = guard;

            return this;
        }

        /**
         * Add behaviour to a transition.
         * @method effect
         * @param {Action} transitionAction The action to add to the transitions traversal behaviour.
         * @returns {Transition} Returns the transition object to enable the fluent API.
         */
        effect<TMessage>(transitionAction: Action): Transition {
            this.transitionBehavior.push(transitionAction);

            this.source.root().clean = false;
 
            return this;
        }

        bootstrap(): void {
            // internal transitions: just perform the actions; no exiting or entering states
            if (this.target === null) {
                this.traverse = this.transitionBehavior;
                
            // local transtions (within the same parent region): simple exit, transition and entry
            } else if (this.target.parent() === this.source.parent()) {
                this.traverse = this.source.leave.concat(this.transitionBehavior).concat(this.target.enter);
                
            // external transitions (crossing region boundaries): exit to the LCA, transition, enter from the LCA
            } else {
                var sourceAncestors = this.source.ancestors();
                var targetAncestors = this.target.ancestors();
                var sourceAncestorsLength = sourceAncestors.length;
                var targetAncestorsLength = targetAncestors.length;
                var i = 0, l = Math.min(sourceAncestorsLength, targetAncestorsLength);

                // find the index of the first uncommon ancestor
                while((i < l) && (sourceAncestors[i] === targetAncestors[i])) {
                    i++;
                }

                // validate transition does not cross sibling regions boundaries
                assert(!(sourceAncestors[i] instanceof Region), "Transitions may not cross sibling orthogonal region boundaries");

                // leave the first uncommon ancestor
                this.traverse = (i < sourceAncestorsLength ? sourceAncestors[i] : this.source).leave.slice(0);

                // perform the transition action
                this.traverse = this.traverse.concat(this.transitionBehavior);

                if (i >= targetAncestorsLength ) {
                    this.traverse = this.traverse.concat(this.target.beginEnter);
                }
                                
                // enter the target ancestry
                while(i < targetAncestorsLength) {
                    targetAncestors[i++].bootstrapEnter((additional: Behavior) => { this.traverse = this.traverse.concat(additional); }, targetAncestors[i]);
                }

                // trigger cascade
                this.traverse = this.traverse.concat(this.target.endEnter);
            }
        }
    }

    function pseudoState(kind: PseudoStateKind): (transitions: Array<Transition>, message: any, context: IContext) => Transition {
        switch(kind) {
            
        case PseudoStateKind.Initial:
        case PseudoStateKind.DeepHistory:
        case PseudoStateKind.ShallowHistory:
            return initial;
        
        case PseudoStateKind.Junction:
            return junction;
        
        case PseudoStateKind.Choice:
            return choice;
            
        case PseudoStateKind.Terminate:
            return terminate;
        }
    }
            
    function initial(transitions: Array<Transition>, message: any, context: IContext): Transition {
        if(transitions.length === 1) {
            return transitions[0];
        } else {
            throw "Initial transition must have a single outbound transition";
        }
    }
    
    function junction(transitions: Array<Transition>, message: any, context: IContext): Transition {
        var result: Transition, i: number, l: number = transitions.length;
        
        for(i = 0; i < l; i++) {
            if(transitions[i].guard(message, context) === true) {
                if(result) {
                        throw "Multiple outbound transitions evaluated true";
                }

                result = transitions[i];
            }
        }
        
        if (!result) {
            for(i = 0; i < l; i++) {
                if(transitions[i].guard === Transition.isElse) {
                    if(result) {
                            throw "Multiple outbound transitions evaluated true";
                    }

                    result = transitions[i];
                }
            }
        }
        
        return result;
    }
    
    function choice(transitions: Array<Transition>, message: any, context: IContext): Transition {
        var results: Array<Transition> = [], result: Transition, i: number, l: number = transitions.length;
                
        for(i = 0; i < l; i++) {
            if(transitions[i].guard(message, context) === true) {
                results.push(transitions[i]);
            }
        }

        if (results.length !== 0) {
            result = results[Math.round((results.length - 1) * Math.random())];            
        }
        
        if (!result) {
            for(i = 0; i < l; i++) {
                if(transitions[i].guard === Transition.isElse) {
                    if(result) {
                            throw "Multiple outbound transitions evaluated true";
                    }

                    result = transitions[i];
                }
            }
        }
        
        return result;
    }
    
    function terminate(transitions: Array<Transition>, message: any, context: IContext): Transition {        
        return;
    }
        
    function invoke(behavior: Behavior, message: any, context: IContext, history: boolean): void {
        for (var i = 0, l = behavior.length; i < l; i++) {
            behavior[i](message, context, history);
        }
    }
      
    function assert(condition: boolean, error: string): void {
        if (!condition) {
            throw error;
        }
    }
    
    interface StateDictionary {
        [index: string]: State;
    }
    
    /**
     * Default working implementation of a state machine context class.
     *
     * Implements the `IContext` interface.
     * It is possible to create other custom context classes to manage state machine state in any way (e.g. as serializable JSON); just implement the same members and methods as this class.
     * @class Context
     * @implements IContext
     */
    export class Context implements IContext {
        public isTerminated: boolean = false;
        private last: StateDictionary = {};

        /**
         * Updates the last known state for a given region.
         * @method setCurrent
         * @param {Region} region The region to update the last known state for.
         * @param {State} state The last known state for the given region.
         */
        setCurrent(region: Region, state: State): void {            
            this.last[region.toString()] = state;
        }

        /**
         * Returns the last known state for a given region.
         * @method getCurrent
         * @param {Region} region The region to update the last known state for.
         * @returns {State} The last known state for the given region.
         */
        getCurrent(region: Region): State {            
            return this.last[region.toString()];
        }
    }
}